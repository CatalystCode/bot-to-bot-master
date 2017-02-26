var path = require('path');
var express = require('express');
var builder = require('botbuilder');
var fs = require('fs');
var bodyParser = require('body-parser')
var request = require('request');


//var subBotEndpoint = 'https://105fab98.ngrok.io';
var subBotEndpoint = 'http://localhost:3978';

var port = process.env.PORT || 3977;
var app = express();

console.log('starting master bot');

var config = require('./config');

app.use((req, res, next) => {
  console.log(`service request for url: '${req.url}'`);
  return next();
});

app.get('/', (req, res) => {
  return res.end('Master bot is on');
});

var connector = new builder.ChatConnector({ 
  appId: config.get('BOT_APP_ID'), 
  appPassword: config.get('BOT_APP_PASSWORD') 
});

var bot = new builder.UniversalBot(connector);

var i = 0;
bot.dialog('/', [
  (session, args, next) => {
    builder.Prompts.text(session, `MasterBot: iteration:${i} step 1, enter something....`);
  },
  (session, args, next) => {
    session.send(`you typed ${args.response}`);
    builder.Prompts.text(session, `MasterBot: iteration:${i} step 2, enter something....`);
  },
  (session, args, next) => {
    session.send(`you typed ${args.response}`);
    builder.Prompts.text(session, `MasterBot: iteration:${i} step 3, enter something....`);
  },
  (session, args, next) => {
    session.send(`you typed ${args.response}`);
    builder.Prompts.text(session, `MasterBot: iteration:${i} step 4, enter something....`);
  },
  (session, args, next) => {
    session.send(`you typed ${args.response}`);
    builder.Prompts.text(session, `MasterBot: iteration:${i} step 5, enter something....`);
  },
  session => {
    i++;
    session.replaceDialog('/', 0);
  }
]);


var conversationRoutes = {};

app.use('/api/messages', bodyParser.json());

app.post('/api/messages', (req, res, next) => {

  if (!req.body || !req.body.text)
    return next();

  console.log('headers:');
  Object.keys(req.headers).forEach(header => console.log(`${header} = ${req.headers[header]}`));
  console.log(`body: ${JSON.stringify(req.body, true, 2)}`);

  // if in the middle of being redirected to the sub bot and the user types bye,
  // we will stop redirecting messages to the sub bot and continue with the master bot
  if (req.body.text.startsWith('bye') && conversationRoutes[req.body.conversation.id]) {
    delete conversationRoutes[req.body.conversation.id];
  }

  // some condition to identify that we want to start routing requests
  // or the user conversation was already started being redirected to a sub-bot
  if (req.body.text.startsWith('sub') || conversationRoutes[req.body.conversation.id]) {

    // store somewhere the fact that from now on we need to route this specific user
    // messages to a specific sub-bot. For now storing in-memory
    conversationRoutes[req.body.conversation.id] = {
      redirect: {
        url: subBotEndpoint + '/api/messages/'
      }
    };

    return request({
      uri: conversationRoutes[req.body.conversation.id].redirect.url,
      method: 'POST',
      headers: req.headers,
      json: true,
      body: req.body
    }, (err, subBotRes) => {
      if (err) {
        console.error(`error from sub bot: ${err}`);
        // use the botbuilder to send an error message to the user using his address
        res.end();
      }

      // pipe the response from the sub bot to the user
      // this is the place where we can intercept returning messages from the sub-bot
      // and modify / act upon them before returning back to the user.
      // currently just piping back to the client
      subBotRes.pipe(res);
    });
  }
  else
    return next();

});

app.post('/api/messages', connector.listen());

app.listen(port, function () {
  console.log(`listening on port ${port}`);
});



module.exports = app;