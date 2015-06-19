(function() {
  var userFrom, userTo;

  function login() {
    if ($('#login').hasClass('pulsate')) {
      return;
    }

    userFrom = {
      url: $('#source input[name="from-url"]').val(),
      email: $('#source input[name="from-email"]').val(),
      password: $('#source input[name="from-password"]').val()
    };
    userTo = {
      url: $('#destination input[name="to-url"]').val(),
      email: $('#destination input[name="to-email"]').val(),
      password: $('#destination input[name="to-password"]').val()
    };

    if (!userFrom.url.match(/^https:\/\/.*\.slack\.com\/?$/) ||
        !userTo.url.match(/^https:\/\/.*\.slack\.com\/?$/)) {
      alert('Slack URLs must start with https:// and end in slack.com!');
      return;
    }

    $('#emoji-list').html('<p>Loading...</p>');
    $('#login').addClass('pulsate');
    $('#login').html('This takes a minute...');

    $.ajax({
      url:'/emojilist',
      method: 'post',
      timeout: 120000,
      data: {
        userFrom: userFrom,
        userTo: userTo
      },
    }).done(function(data) {
      saveSuccessfulLogin();
      $('#emoji-list').html(data);
      $('#emoji-list li').click(transferEmoji);
      $('#emoji-list button').click(logout);

      $('#loginz').addClass('loginz-collapse');
      $('#emoji-list').removeClass('hidden');
    }).fail(function(error) {
      $('#login').show();
      $('#emoji-list').html('');

      switch(error.status) {
        case 400:
          alert('These form fields are invalid:\n' +
            error.responseJSON.validation.keys.join(', '));
          break;
        case 401:
          alert(error.responseJSON.message);
          break;
        case 404:
          alert(error.responseJSON.message);
          break;
        case 429:
          alert('Too many requests.\nWait and try again.');
          break;
        case 500:
          alert('Internal Server Error');
          break;
        default:
          alert('Unknown Error');
          break;
      }
    }).always(function() {
      $('#login').removeClass('pulsate');
      $('#login').html('Get Some Emoji 👍');
    });
  }

  function checkInput() {
    if($(this).val()) {
      $(this).addClass('has-value');
    } else {
      $(this).removeClass('has-value');
    }
  }

  function saveSuccessfulLogin() {
    if (localStorage) {
      $('input[type="text"], input[type="email"]').each(function() {
        localStorage.setItem('slack-porter-' + this.name, $(this).val());
      });
    }
  }

  function restoreSuccessfulLogin() {
    if (localStorage) {
      $('input[type="text"], input[type="email"]').each(function() {
        $(this).val(localStorage.getItem('slack-porter-' + this.name));
      });
    }
  }

  function returnSubmitsForm(e) {
    if(e.which == 13) {
      login();
    }
  }

  function transferEmoji() {
    if (!$(this).hasClass('disabled') && !$(this).hasClass('pulsate')) {
      var emojiName = $(this).data('name');
      var emojiUrl = $(this).data('url');
      $(this).addClass('pulsate');

      $.ajax({
        url:'/transferEmoji',
        method: 'post',
        timeout: 120000,
        data: {
          userFrom: userFrom,
          userTo: userTo,
          emojiName: emojiName,
          emojiUrl: emojiUrl
        },
      }).done(function(data) {
        $(this).removeClass('pulsate');
        $(this).addClass('disabled');
        $(this).find('.transferred').removeClass('hidden');
      }.bind(this)).fail(function(error) {
        $(this).removeClass('pulsate');
        switch(error.status) {
          case 400:
            alert('Somehow, you sent a bad request.');
            break;
          case 401:
            alert(error.responseJSON.message);
            break;
          case 429:
            alert('Too many requests.\nWait and try again.');
            break;
          case 500:
            alert('Internal Server Error');
            break;
          default:
            alert('Unknown Error');
            break;
        }
      }.bind(this));
    }
  }

  function logout() {
    $('#emoji-list').html('');
    $('#loginz').removeClass('loginz-collapse');
    $('#emoji-list').addClass('hidden');
    $('input[type="password"]').val('').each(checkInput);
  }

  function makeFloaters() {
    // IE 11 doesn't render this correctly, but maybe I'll fix it later.
    var emojis = ['😆','️🍖','💕','🚀','👍','🍕','🎉','🐦','👊','💀',
                  '🍩','🐛','😍','💩','💸','🔥','🍎','👽','💖','🐠'];
    var template = '<span class="floater">%e</span>';

    // Fewer emojis on smaller screens.
    if ($(window).width() < 1000) {
      emojis.length = emojis.length/2;
    }

    emojis.forEach(function(e) {
      $('#emoji-background').append(template.replace('%e', e));
    });

    var i=1;
    var animCss = '<style>\n';
    $('#emoji-background .floater').each(function() {
      var topStart = Math.round(Math.random() * 100);
      var topEnd = Math.round(Math.random() * 100);
      var duration = Math.round(Math.random() * 20 + 8);
      var delay = Math.round(Math.random() * 20);
      var rotationStart = Math.round(Math.random() * 360);
      var rotationEnd = Math.round(Math.random() * 360 + 360);
      var leftStrings = ['left: -120px;\n', 'left: calc(100vw + 120px);\n'];
      if (Math.random() > 0.5) {
        leftStrings.unshift(leftStrings.pop());
      }

      $(this).addClass('floater-' + i);
      animCss += '@keyframes emoji-float-' + i + ' ' +
          '{ \n' +
          '  from {\n' +
          '    ' + leftStrings.pop() +
          '    top: ' + topStart + 'vh;\n' +
          '    transform: rotateZ(' + rotationStart + 'deg);\n' +
          '  }\n' +
          '  to {\n' +
          '    ' + leftStrings.pop() +
          '    top: ' + topEnd + 'vh;\n' +
          '    transform: rotateZ(' + rotationEnd + 'deg);\n' +
          '  }\n' +
          '}\n';

      animCss += '#emoji-background .floater-' + i + ' ' +
          '{ \n' +
          '  animation: emoji-float-' + i + ' ' + 
          duration + 's ' +
          delay + 's linear infinite alternate; \n' +
          '}\n';
      i++;
    });
    animCss += '</style>';
    $(document.body).append(animCss);
  }

  restoreSuccessfulLogin();
  makeFloaters();
  $('#loginz input').focusout(checkInput);
  $('#loginz input').each(checkInput);
  $('#login').click(login);
  $('input').keypress(returnSubmitsForm);
})();

