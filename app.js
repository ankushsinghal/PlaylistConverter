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
        res.redirect('http://localhost:8888/playlists');
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
        resolve(body);
      }
      else {
        console.log(error);
        console.log(body);
        reject(error);
      }
    });
  });
}

function convertToYoutubeSearchQuery(track_name, track_artists){
  var query = track_name + ' by ';
  for(var num_artists = 0; num_artists < track_artists.length - 2; num_artists++){
    query += track_artists[num_artists] + ', ';
  }
  if(track_artists.length > 1){
    query += track_artists[track_artists.length - 2] + ' and ';
  }
  query += track_artists[track_artists.length - 1];
  return query;
}

function getYoutubeVideoId(youtube_query){
  var youtubeQueryOptions = {
    url: 'https://www.googleapis.com/youtube/v3/search?' + 
    querystring.stringify({
      part: 'snippet',
      maxResults: 1,
      q: youtube_query,
      key: credentials.api_key
    })
  };

  return new Promise(function(resolve, reject){
    request.get(youtubeQueryOptions, function(error, response, body){
      if(!error && response.statusCode === 200){
        body = JSON.parse(body);
        resolve(body['items'][0]['id']['videoId']);
      }
      else{
        reject(error);
      }
    });
  });
}

app.get('/playlist/:playlistId-:playlistName', function(req, res){

  const promises = [];
  //promises.push(createYoutubePlaylist(req.params.playlistName));
  promises.push(getSpotifyPlaylistById(req.params.playlistId));

  Promise.all(promises).then(function(values){
    var tracks = values[0]['tracks']['items'];
    const innerPromises = [];
    for(var track_no = 0; track_no < tracks.length; track_no++){
      var track = tracks[track_no]['track'];
      var track_name = track['name'];
      var track_artists = [];
      var track_artists_details = track['artists'];
      for(var artist_no = 0; artist_no < track_artists_details.length; artist_no++){
        var track_artists_detail = track_artists_details[artist_no];
        var artist_name = track_artists_detail['name'];
        track_artists.push(artist_name);
      }
      var youtube_query = convertToYoutubeSearchQuery(track_name, track_artists);
      console.log(youtube_query);
      innerPromises.push(getYoutubeVideoId(youtube_query));
    }
    Promise.all(innerPromises).then(function(values){
      var youtube_url = 'http://www.youtube.com/watch_videos?video_ids=';
      for(var id_no = 0; id_no < values.length - 1; id_no++){
        youtube_url += values[id_no] + ',';
      }
      youtube_url += values[values.length - 1];
      res.redirect(youtube_url);
    });
  });

});

console.log('Listening on 8888');
app.listen(8888);