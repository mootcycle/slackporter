var request = require('request');
var util = require('util');
var Q = require('q');
var cheerio = require('cheerio');
var winston = require('winston');

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

    deferred.resolve(options);
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
    json: true,
    formData: {
      token: options.token
    },
    method: 'POST'
  }, function(error, response, body) {
    if (error || !body || !body.ok || !body.emoji) {
      return deferred.reject(error);
    }
    for (var e in body.emoji) {
      if (body.emoji[e].match(/^alias:/)) {
        delete(body.emoji[e]);
      }
    }

    options.emoji = body.emoji;
    deferred.resolve(options);
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
module.exports.fetchEmojiList = fetchEmojiList;
module.exports.getEmojiUploadPage = getEmojiUploadPage;
module.exports.transferEmoji = transferEmoji;
