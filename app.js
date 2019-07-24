var express = require('express');
var querystring = require('querystring');
var request = require('request');
var path = require('path');
var exphbs = require('express-handlebars');
var Promise = require('promise');
var credentials = require('./credentials');

var global_spotify_access_token;
var global_youtube_access_token;

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

        global_spotify_access_token = access_token;
        res.redirect('http://localhost:8888/youtube');
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

app.get('/youtube', function(req, res){
  res.render('index_youtube');
});

app.get('/youtube/login', function(req, res){
  var state = generateRandomString(16);
  var scope = 'https://www.googleapis.com/auth/youtube';

  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' +
    querystring.stringify({
      client_id: credentials.youtube_client_id,
      redirect_uri: credentials.youtube_redirect_uri,
      scope: scope,
      access_type: 'offline',
      state: state,
      response_type: 'code'
    }));
});

app.get('/youtube/callback', function (req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;

  if (state === null) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  }
  else {
    var authOptions = {
      url: 'https://www.googleapis.com/oauth2/v4/token',
      form: {
        code: code,
        redirect_uri: credentials.youtube_redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(credentials.youtube_client_id + ':' + credentials.youtube_client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token;
        var refresh_token = body.refresh_token;

        global_youtube_access_token = access_token;
        res.redirect('http://localhost:8888/playlists');
      }
      else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

function getSpotifyUserDetails(){
  
  var userOptions = {
    url: 'https://api.spotify.com/v1/me',
    headers: { 'Authorization': 'Bearer ' + global_spotify_access_token },
    json: true
  };

  // use the access token to access the Spotify Web API
  return new Promise(function(resolve, reject){
    request.get(userOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        console.log(body);
        userDetails = body;
        resolve(userDetails);
      }
      else {
        reject(error);
      }
    });
  });
}

function getSpotifyPlaylists(){
  
  var playlistOptions = {
    url: 'https://api.spotify.com/v1/me/playlists',
    headers: { 'Authorization': 'Bearer ' + global_spotify_access_token },
    json: true
  };

  return new Promise(function(resolve, reject){
    request.get(playlistOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        console.log(body);
        userPlaylistsDetails = body;
        resolve(userPlaylistsDetails);
      }
      else {
        reject(error);
      }
    });
  });
}

function displaySpotifyPlaylists() {
  const promises = [];
  promises.push(getSpotifyUserDetails());
  promises.push(getSpotifyPlaylists());
  return Promise.all(promises);
}

app.get('/playlists', function(req, res){
  
  var details;

  displaySpotifyPlaylists().then(function(values){
    details = {user: values[0], userPlaylists: values[1]};
    res.render('playlists', details);
  });

});

function getSpotifyPlaylistById(playlistId){
  
  var playlistOptions = {
    url: 'https://api.spotify.com/v1/playlists/' + playlistId,
    headers: { 'Authorization': 'Bearer ' + global_spotify_access_token },
    json: true
  };

  return new Promise(function(resolve, reject){
    request.get(playlistOptions, function (error, response, body) {
      if(!error && response.statusCode === 200){
        console.log("GOT SPOTIFY PLAYLIST BY ID");
        resolve(body);
      }
      else{
        reject(error);
      }
    });
  });
}

function createYoutubePlaylist(playlistName){
  
  var playlistAuthOptions = {
    url: 'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    body: {
      snippet: {
        title: playlistName,
      },
      status: {
        privacyStatus: 'public'
      }
    },
    headers: {
      'Authorization': 'Bearer ' + global_youtube_access_token
    },
    json: true
  };

  return new Promise(function(resolve, reject){
    request.post(playlistAuthOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        console.log("YOUTUBE PLAYLIST CREATED");
        resolve(body);
      }
      else {
        reject(error);
      }
    });
  });
}

app.get('/playlist/:playlistId-:playlistName', function(req, res){

  const promises = [];
  promises.push(createYoutubePlaylist(req.params.playlistName));
  promises.push(getSpotifyPlaylistById(req.params.playlistId));

  Promise.all(promises).then(function(values){
    console.log(values[1]);
  });

});

console.log('Listening on 8888');
app.listen(8888);