var request = require('request');
var util = require('util');
var Q = require('q');
var cheerio = require('cheerio');
var winston = require('winston');

var webTokenUrl = 'https://api.slack.com/web';
var generateTokenUrl = 'https://api.slack.com/tokens';
var emojiListUrl = 'https://slack.com/api/emoji.list';
var emojiUploadFormPath = '/admin/emoji';
var emojiUploadImagePath = '/customize/emoji';


/**
 * Fetch the login page
 */

function getLoginPage(options) {
  var deferred = Q.defer();

  winston.info('getLoginPage for: ',
      options.info.remoteAddress,
      ' -- ',
      options.url);

  options.jar = options.jar || request.jar();

  request({
    url: options.url,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    method: 'GET'
  }, function(error, response, body) {
    if (error) {
      return deferred.reject(error);
    } else if (response.statusCode == 404) {
      var e = new Error('team page not found');
      e.url = options.url;
      e.statusCode = 404;
      return deferred.reject(e);
    }

    var $ = cheerio.load(body);

    options.formData = {
      signin: $('#signin_form input[name="signin"]').attr('value'),
      redir: $('#signin_form input[name="redir"]').attr('value'),
      crumb: $('#signin_form input[name="crumb"]').attr('value'),
      remember: 'on',
      email: options.email,
      password: options.password
    };

    deferred.resolve(options);
  });

  return deferred.promise;
}

/**
 * Login and populate cookies
 */

function postLoginPage(options) {
  var deferred = Q.defer();

  winston.info('postLoginPage for: ',
      options.info.remoteAddress,
      ' -- ',
      options.url);

  request({
    url: options.url,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    method: 'POST',
    followAllRedirects: true,
    formData: options.formData
  }, function(error, response, body) {
    delete(options.formData);

    if (error) {
      return deferred.reject(error);
    } else if (!options.jar.getCookies(options.url).length) {
      var e = new Error('invalid password');
      e.statusCode = 401;
      e.url = options.url;

      return deferred.reject(e);
    }

    try {
      // This is a terrible hack and very brittle.
      var teamText = body.match(
          /metaData\.team\W+=\W+(\{(([\w]+:"[^"]+"),*)+\});/)[1];

      options.team_id = teamText.match(/id:"(\w+?)"/)[1];
      options.team_name = teamText.match(/name:"([\w\W]+?)"/)[1];

      deferred.resolve(options);
    } catch(matchError) {
      deferred.reject(matchError);
    }
  });

  return deferred.promise;
}

/**
 * Attempt to get a web token for the account.
 */

function getWebToken(options) {
  var deferred = Q.defer();

  winston.info('getWebToken for: ',
      options.info.remoteAddress,
      ' -- ',
      webTokenUrl);

  request({
    url: webTokenUrl,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    method: 'GET'
  }, function(error, response, body) {
    if (error) {
      return deferred.reject(error);
    }

    var $ = cheerio.load(body);

    $('code').each(function() {
      var token = $(this).text().match(/xoxp(-[0-9A-Za-z]+){4}/);
      if (token) {
        options.token = token[0];
        return false;
      }
    });

    if (options.token) {
      deferred.resolve(options);
    } else {
      var c = body.match(/[^\w](\w-\w{10}-\w{10}-.)[^\w]/);
      options.tokenFormData = {
        team_id: options.team_id,
        crumb: c ? c[1] : '',
        reissue_token: '1'
      };

      generateWebToken(options)
      .then(function(options) {
        deferred.resolve(options);
      })
      .fail(function(error) {
        deferred.reject(error);
      });
    }
  });

  return deferred.promise;
}

/**
 * Generate a token if one did not already exist.
 */

function generateWebToken(options) {
  var deferred = Q.defer();

  winston.info('generateWebToken for: ',
      options.info.remoteAddress,
      ' -- ',
      generateTokenUrl);

  request({
    url: generateTokenUrl,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    method: 'POST',
    formData: options.tokenFormData
  }, function(error, response, body) {
    delete(options.tokenFormData);
    if (error) {
      return deferred.reject(error);
    }

    if (body && body.match(/xoxp(-[0-9A-Za-z]+){4}/)) {
      options.token = body;
      deferred.resolve(options);
    } else {
      deferred.reject();
    }
  });

  return deferred.promise;
}

/**
 * Fetch the list of emojis
 */

function fetchEmojiList(options) {
  var deferred = Q.defer();

  winston.info('fetchEmojiList for: ',
      options.info.remoteAddress,
      ' -- ',
      emojiListUrl);

  request({
    url: emojiListUrl,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    json: true,
    formData: {
      token: options.token
    },
    method: 'POST'
  }, function(error, response, body) {
    if (error || !body || !body.emoji) {
      return deferred.reject(error);
    }

    for (var e in body.emoji) {
      if (body.emoji[e].match(/^alias:/)) {
        delete(body.emoji[e]);
      }
    }

    if (body.ok) {
      options.emoji = body.emoji;
      deferred.resolve(options);
    } else {
      deferred.reject(body);
    }
  });

  return deferred.promise;
}

/**
 * Get the emoji upload page
 */

function getEmojiUploadPage(options) {
  var deferred = Q.defer();

  winston.info('getEmojiUploadPage for: ',
      options.info.remoteAddress,
      ' -- ',
      options.url + emojiUploadFormPath);

  request({
    url: options.url + emojiUploadFormPath,
    jar: options.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    method: 'GET'
  }, function(error, response, body) {
    if (error) {
      return deferred.reject(error);
    }

    var $ = cheerio.load(body);

    options.uploadCrumb = $('#addemoji > input[name="crumb"]').attr('value');

    deferred.resolve(options);
  });

  return deferred.promise;
}

/**
 * Transfer an emoji between teams.
 */

function transferEmoji(toOptions, emojiName, emojiUrl) {
  var deferred = Q.defer();

  winston.info('transferEmoji for: ',
      toOptions.info.remoteAddress,
      ' -- ',
      emojiName,
      ' -- ',
      emojiUrl);

  var r = request({
    url: toOptions.url + emojiUploadImagePath,
    method: 'POST',
    jar: toOptions.jar,
    headers: {
      'X-Slack-Porter': '💖'
    },
    followAllRedirects: true
  }, function(error, response, body) {
    if (error || !body) {
      return deferred.reject(error);
    }

    deferred.resolve();
  });

  var form = r.form();

  form.append('add', '1');
  form.append('crumb', toOptions.uploadCrumb);
  form.append('name', emojiName);
  form.append('mode', 'data');
  form.append('img', request(emojiUrl));

  return deferred.promise;
}


module.exports.getLoginPage = getLoginPage;
module.exports.postLoginPage = postLoginPage;
module.exports.getWebToken = getWebToken;
module.exports.fetchEmojiList = fetchEmojiList;
module.exports.getEmojiUploadPage = getEmojiUploadPage;
module.exports.transferEmoji = transferEmoji;
