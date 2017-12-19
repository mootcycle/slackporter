var assert = require('assert');
var path = require('path');
var util = require('util');

var Boom = require('boom');
var Hapi = require('hapi');
var Joi = require('joi');
var Q = require('q');
var winston = require('winston');

var porter = require('./porter');

winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
  level: 'debug'
});
winston.add(winston.transports.File, {
  filename: './slackporter.log',
  level: 'info'
});

var server = new Hapi.Server();
server.connection({ port: 2603, host: '127.0.0.1' });

var fromUserSchema = Joi.object().keys({
  url: Joi.string().uri().regex(/^https:\/\/.*\.slack\.com\/?$/).required(),
  token: Joi.string().allow(''),
  emojiJson: Joi.string().allow('')
});

var toUserSchema = Joi.object().keys({
  url: Joi.string().uri().regex(/^https:\/\/.*\.slack\.com\/?$/).required(),
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  token: Joi.string().required()
});

var loginSchema = Joi.object().keys({
  userFrom: fromUserSchema,
  userTo: toUserSchema
});

var transferSchema = Joi.object().keys({
  userFrom: fromUserSchema,
  userTo: toUserSchema,
  emojiName: Joi.string().required(),
  emojiUrl: Joi.string().uri().required()
});


// Just guessing at what reasonable rate limits should be.
var rateLimiter = {};
var MAX_REQUESTS = 10;
var RATE_INTERVAL = 2000;

setInterval(function() {
  rateLimiter = {};
}, RATE_INTERVAL);

server.register(require('vision'), function(err) {
  assert(!err, err);

  server.views({
    engines: {
      'html': {
        module: require('handlebars'),
        compileMode: 'sync'
      }
    },
    compileMode: 'async',
    path: path.join(__dirname, 'templates')
  });
});

server.register(require('inert'), function(err) {
  server.route([{
    method: 'GET',
    path: '/static/{param*}',
    handler: {
      directory: {
        path: 'static'
      }
    }
  }]);
});


server.route([{
  method: 'GET',
  path: '/',
  handler: function (request, reply) {
    reply.view('index');
  }
}, {
  method: 'POST',
  path: '/emojilist',
  config: {
    validate: {
      payload: loginSchema
    }
  },
  handler: function(request, reply) {
    rateLimiter[request.info.remoteAddress] =
        rateLimiter[request.info.remoteAddress] + 1 || 1;
    if (rateLimiter[request.info.remoteAddress] > MAX_REQUESTS) {
      return reply(Boom.tooManyRequests('too many requests'));
    }

    var userFrom  = request.payload.userFrom;
    var userTo = request.payload.userTo;

    if (!userFrom.token && !userFrom.emojiJson) {
      return reply(
        Boom.badRequest('You must enter either a token or a JSON response.'));
    } 

    request.payload.userFrom.info = request.info;
    request.payload.userTo.info = request.info;

    var fromPromise = porter.fetchEmojiList(request.payload.userFrom);

    var toPromise = porter.getLoginPage(request.payload.userTo)
      .then(porter.postLoginPage)
      .then(porter.fetchEmojiList);

    Q.all([fromPromise, toPromise])
    .then(function(results) {
      try {
        for (var e in results[1].emoji) {
          delete(results[0].emoji[e]);
        }
        reply.view('emojis', { emoji: results[0].emoji });
      } catch(error) {
        winston.error('emojilist Error:\n' + util.inspect(error));
        reply(Boom.badImplementation('Internal Server Error'));
      }
    }, function(error) {
      winston.error('emojilist all handler Error:\n' + util.inspect(error));
      if (error.statusCode) {
        switch(error.statusCode) {
          case 404:
            reply(Boom.notFound('Team page not found for ' + error.url));
            break;
          case 401:
            reply(Boom.unauthorized('Invalid password for ' + error.url));
            break;
        }
      } else {
        reply(Boom.badImplementation('Internal Server Error'));
      }
    });
  }
}, {
  method: 'POST',
  path: '/transferEmoji',
  config: {
    validate: {
      payload: transferSchema
    }
  },
  handler: function(request, reply) {
    rateLimiter[request.info.remoteAddress] =
        rateLimiter[request.info.remoteAddress] + 1 || 1;
    if (rateLimiter[request.info.remoteAddress] > MAX_REQUESTS) {
      return reply(Boom.tooManyRequests('too many requests'));
    }

    request.payload.userTo.info = request.info;

    porter.getLoginPage(request.payload.userTo)
      .then(porter.postLoginPage)
      .then(porter.getEmojiUploadPage)
      .then(function(options) {
        return porter.transferEmoji(options,
            request.payload.emojiName,
            request.payload.emojiUrl);
      })
      .then(function() {
        reply({success: true});
      })
      .fail(function(error) {
        winston.error('/transferEmoji error:\n', util.inspect(error));
        reply(Boom.badImplementation('Internal Server Error'));
      });
  }
}]);

server.start(function () {
  winston.info('\n\nServer running at:', server.info.uri);
});
