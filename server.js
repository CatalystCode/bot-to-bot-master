var path = require('path');
var express = require('express');
var builder = require('botbuilder');
var fs = require('fs');
var bodyParser = require('body-parser')
var request = require('request');

// TODO: take from configuration
var subBotConfig = {
  //endpoint: 'https://a71fecbf.ngrok.io',
  endpoint: 'http://localhost:3978',
  appId1: '4ba63ee1-9828-4857-8af5-f57871f5a864',
  appPassword: '3ggREe8duvifhpd6QAVoB4M'
};

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
        url: subBotConfig.endpoint + '/api/messages/'
      };

       bot.send(new builder.Message()
        .address(userConversation.address)
        .text(`_starting redirecting messages to slave bot: ${subBotConfig.endpoint}_`));
    }

    var recipient = {
      "id": "routingbotsub1@ZmbRNCsg2Ls",
      "name": "routing bot - sub1"
    };

    //var d = JSON.stringify(req.body.recipient).length - JSON.stringify(recipient).length;
    //req.headers['content-length'] = (parseInt(req.headers['content-length']) + d) + '';

   // req.body.recipient = recipient;

    delete req.headers['content-length'];

    var opts = {
      uri: userConversation.redirect.url,
      method: 'POST',
      headers: req.headers,
      json: true,
      body: req.body
    };

    opts.headers.host = 'a71fecbf.ngrok.io';

    return addAuthHeader(subBotConfig, opts.headers)
      .then(() => {
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
          // this is the place where we can intercept returning messages from the sub-bot
          // and modify / act upon them before returning back to the user.
          // currently just piping back to the client

//          return subBotRes.pipe(res);

          // get the response from the sub bot
          // apperantly this is not the actual result of the dialog as I thought...
          // but just an indication that it got the request.
          // the respose will be sent by the sub bot directly to te emulator in the case where we're working with it.
          // what we need to do now is polling to get the response for the request from the sub bot :(
          var data = '';
          subBotRes.on('data', chunk => {
            data += chunk.toString(); 
            console.log('data: ', data);
          });
          subBotRes.on('end', () => {
            var json = JSON.parse(data);
            console.log(`body: ${JSON.stringify(data, 2, true)}`);
            res.end(data);
          });
          subBotRes.on('error', err => console.error(err))

        })
      })
      .catch(err => console.error(err));
  }
  else
    return next();

});

var accessTokenHeader;
var accessTokenExpires;

function addAuthHeader(botConfig, headers) {
  return new Promise((resolve, reject) => {
    
    //return resolve();
    
    // remove previous header if exists (for example from previous original request)
 //   delete headers.authorization;
 //   delete headers.Authorization;

delete headers['x-forwarded-proto'];
delete headers['x-forwarded-for'];


    if (botConfig.appId && botConfig.appPassword) {
        
      if (!accessTokenHeader || new Date().getTime() >= this.accessTokenExpires) {
        // Refresh access token
        var opt = {
          method: 'POST',
          url: 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
          form: {
            grant_type: 'client_credentials',
            client_id: botConfig.appId,
            client_secret: botConfig.appPassword,
            scope: 'https://api.botframework.com/.default'
          }
        };
        
        return request(opt, (err, response, body) => {
          if (err) return reject(err);
          if (body && response.statusCode < 300) {
            // Subtract 5 minutes from expires_in so they'll we'll get a
            // new token before it expires.
            var oauthResponse = JSON.parse(body);
            accessTokenHeader = 'Bearer ' + oauthResponse.access_token;
            accessTokenExpires = new Date().getTime() + ((oauthResponse.expires_in - 300) * 1000); 


accessTokenHeader = "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IkdDeEFyWG9OOFNxbzdQd2VBNy16NjVkZW5KUSIsIng1dCI6IkdDeEFyWG9OOFNxbzdQd2VBNy16NjVkZW5KUSJ9.eyJpc3MiOiJodHRwczovL2FwaS5ib3RmcmFtZXdvcmsuY29tIiwiYXVkIjoiNGJhNjNlZTEtOTgyOC00ODU3LThhZjUtZjU3ODcxZjVhODY0IiwiZXhwIjoxNDg5MDc1NDg3LCJuYmYiOjE0ODkwNzQ4ODd9.D-Gir9c0BWP_9YlxzFNlRQhRiJgJIkznzp4AOqVnIbpGedRaP83W_2r8gIbt2EmNkQH7Yhrb6fZgYGgyQ_IxDKLsdWFtIUhmmlgtQhzNqwk443mYXO0qUqB0R3VteGZ-YV21g-VQA7VtodgPSWhyx4102YUmF2Ruixej7X0T1UCi1xJrYtiv1XVNif3uTJduOMWB_hXR2gphimo6Vhrx4lhPyjbRCcuuGVDc5L2s8tg5PSIYErXjStsvoNB1a0hpukvAoqGc-jlfWzQBjrzV340JfXbYVc7xkv3dTcXBHep8lOWtItpAOxGbBgnFhHO4G3yoOWmYlZuwOZ1QUOFdsQ"

var lengthDelta = accessTokenHeader.length - headers['authorization'].length;
if (accessTokenHeader !== headers['authorization']) {
  console.log('different');
}


            headers['authorization'] = accessTokenHeader;
            return resolve();
          }
            
          return reject(new Error('Refresh access token failed with status code: ' + response.statusCode));
        });
      }

      // we already have the access token
      headers['authorization'] = accessTokenHeader;
      return resolve();

    }

    // we don't have appId and appPassword- no need to add auth header
    return resolve();
  });
}



app.post('/api/messages', connector.listen());

app.listen(port, function () {
  console.log(`listening on port ${port}`);
});

module.exports = app;