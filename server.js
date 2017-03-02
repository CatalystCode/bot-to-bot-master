var path = require('path');
var express = require('express');
var builder = require('botbuilder');
var fs = require('fs');
var bodyParser = require('body-parser')
var request = require('request');

// TODO: take from configuration
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

var bot = new builder.UniversalBot(connector, {
  storage: new builder.MemoryBotStorage()
});

var conversations = {};

// Implementation the main dialog of the master bot
// Currently just counting step number to demonstrate where we're at the conversation
bot.dialog('/', [
  (session, args, next) => {

    if (!conversations[session.message.address.conversation.id]) {
      conversations[session.message.address.conversation.id] = { address: session.message.address };
    }

    // keep track of the user's steps in the dialog
    if (!session.privateConversationData.step) {
      session.privateConversationData.step = 1;
    }

    builder.Prompts.text(session, `** -MasterBot- **: step ${session.privateConversationData.step++}, enter something....`);
  },
  (session, args, next) => {
    //session.send(`you typed ${args.response}`);
    session.replaceDialog('/', 0);
  }
]);


app.use('/api/messages', bodyParser.json());

app.post('/api/messages', (req, res, next) => {

  if (!req.body || !req.body.text)
    return next();

  console.log(`headers:\n${JSON.stringify(req.headers, true, 2)}\n\n`);
  console.log(`body:\n${JSON.stringify(req.body, true, 2)}`);

  var userConversation = conversations[req.body.conversation.id] || {};

  // if in the middle of being redirected to the sub bot and the user types bye,
  // we will stop redirecting messages to the sub bot and continue with the master bot
  if (req.body.text.startsWith('bye') && userConversation.redirect) {
     bot.send(new builder.Message()
        .address(userConversation.address)
        .text(`_(master bot resumed control)_`));
    delete userConversation.redirect;
  }

  // some condition to identify that we want to start routing requests
  // or the user conversation was already started being redirected to a sub-bot
  if (req.body.text.startsWith('slave') || userConversation.redirect) {

    // store the fact that from now on we need to route this specific user
    // messages to a specific sub-bot.
    if (!userConversation.redirect) {
      userConversation.redirect = {
        url: subBotEndpoint + '/api/messages/'
      };

       bot.send(new builder.Message()
        .address(userConversation.address)
        .text(`_starting redirecting messages to slave bot: ${subBotEndpoint}_`));
    }

    return request({
      uri: userConversation.redirect.url,
      method: 'POST',
      headers: req.headers,
      json: true,
      body: req.body
    }, (err, subBotRes) => {
      if (err) {
        console.error(`error from slave bot: ${err}`);

        // use the botbuilder to send an error message to the user using his address
        bot.send(new builder.Message()
          .address(userConversation.address)
          .text("Sorry, there was an error in the slave bot...!"));

        return res.end();
      }

      // pipe the response from the sub bot to the user
      // this is the place where we can intercept returning messages from the sub-bot
      // and modify / act upon them before returning back to the user.
      // currently just piping back to the client
      return subBotRes.pipe(res);
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