var express = require('express');
var querystring = require('querystring');
var request = require('request');
var path = require('path');
var exphbs = require('express-handlebars');
var credentials = require('./credentials');

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function (length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var app = express();
app.use(express.static(__dirname + '/public'));

app.set('views', path.join(__dirname, 'views'));
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

app.get('/', function(req, res){
  res.render('index');
});

app.get('/login', function(req, res){
  var state = generateRandomString(16);

  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: credentials.client_id,
      scope: scope,
      redirect_uri: credentials.redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res){
  
  var code = req.query.code || null;
  var state = req.query.state || null;
  console.log('nodemon');

  if(state === null){
    res.redirect('/#' + 
      querystring.stringify({
        error: 'state_mismatch'
      }));
  }
  else{
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: credentials.redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(credentials.client_id + ':' + credentials.client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body){
      if (!error && response.statusCode === 200){
        var access_token = body.access_token;
        var refresh_token = body.refresh_token;

        var details;

        var userOptions = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(userOptions, function (error, response, body) {
          console.log(body);

          var userDetails = body;
          var playlistOptions = {
            url: 'https://api.spotify.com/v1/me/playlists',
            headers: {'Authorization': 'Bearer ' + access_token},
            json: true
          };

          request.get(playlistOptions, function(error, response, body){
            console.log(body);

            var userPlaylistsDetails = body;
            details = {user: userDetails, userPlaylists: userPlaylistsDetails};

          });
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      }
      else{
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });

  }

});

console.log('Listening on 8888');
app.listen(8888);