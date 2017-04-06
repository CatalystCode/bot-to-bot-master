var path = require('path');
var express = require('express');
var builder = require('botbuilder');
var fs = require('fs');
var bodyParser = require('body-parser')
var request = require('request');
var url = require('url');

var port = process.env.PORT || 3977;
var app = express();

console.log('starting master bot');

var config = require('./config');

var subBotConfig = {
  endpoint: config.get('SUB_BOT_URL')
};

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

// API for the slave bot to call when it wants to actively return control to the master bot
app.post('/api/leave/:conversationId', (req, res, next) => {
  var conversationId = req.params.conversationId;
  var userConversation = conversations[conversationId];
  if (!userConversation) return res.end();

  bot.send(new builder.Message()
          .address(userConversation.address)
          .text(`_(master bot resumed control)_`));

  delete userConversation.redirect;
  console.log(`master bot resumed control on conversation Id ${conversationId}`);
  return res.end();
});

app.use('/api/messages', bodyParser.json());

// This handler intercepts incoming messages, and identifies when the messages should be redirected to a sub-bot.
app.post('/api/messages', (req, res, next) => {

  if (!req.body) return next();

  console.log(`headers:\n${JSON.stringify(req.headers, true, 2)}\n\n`);
  console.log(`body:\n${JSON.stringify(req.body, true, 2)}`);

  var userConversation = conversations[req.body.conversation.id] || {};

  // if in the middle of being redirected to the sub bot and the user types bye,
  // we will stop redirecting messages to the sub bot and continue with the master bot
  if (req.body.text && req.body.text.startsWith('bye') && userConversation.redirect) {
     bot.send(new builder.Message()
        .address(userConversation.address)
        .text(`_(master bot resumed control)_`));
    delete userConversation.redirect;
  }

  // some condition to identify that we want to start routing requests
  // or the user conversation was already started being redirected to a sub-bot
  if (req.body.text && req.body.text.startsWith('slave') || userConversation.redirect) {

    // store the fact that from now on we need to route this specific user
    // messages to a specific sub-bot.
    if (!userConversation.redirect) {
      userConversation.redirect = {
        url: subBotConfig.endpoint + '/api/messages'
      };

       bot.send(new builder.Message()
        .address(userConversation.address)
        .text(`_starting redirecting messages to slave bot: ${subBotConfig.endpoint}_`));
    }

    var opts = {
      uri: userConversation.redirect.url,
      method: 'POST',
      headers: req.headers,
      json: true,
      body: req.body
    };

    // update the host header to the sub-bot host name
    opts.headers.host = url.parse(opts.uri).hostname;

    // forward request to sub bot
    return request(opts, (err, subBotRes) => {
      if (err) {
        console.error(`error from slave bot: ${err}`);

        // use the botbuilder to send an error message to the user using his address
        bot.send(new builder.Message()
          .address(userConversation.address)
          .text("Sorry, there was an error in the slave bot...!"));

        return res.end();
      }

      if (subBotRes.statusCode >= 300) {
          console.error(`Issue accessing slave bot: statusCode: ${subBotRes.statusCode}, statusMessage: ${subBotRes.statusMessage}, body: ${subBotRes.body}`);

        // use the botbuilder to send an error message to the user using his address
        bot.send(new builder.Message()
          .address(userConversation.address)
          .text("Sorry, there was an error accessing the slave bot...!"));

        return res.end();
      }

      // pipe the response from the sub bot to the user
      // THIS IS NOT the actual sub bot reply, this is just an acknowledgment that the bot got the message.
      // The response from the bot to the client will be routed to the same client/conversation since they
      // bot use the same app id.
      return subBotRes.pipe(res);
    })
     
  }
  else {
    // this message should not be forwarded to the sub-bot, continue to the bot handlers
    return next();
  }

});

app.post('/api/messages', connector.listen());

app.listen(port, function () {
  console.log(`listening on port ${port}`);
});

module.exports = app;