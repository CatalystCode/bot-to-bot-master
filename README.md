# Bot-To-Bot Master

This is an example for a master bot that can route user messages to other external bots (slaves) that are developed and deployed independently.

## How to use

* Follow these commands to download and run te master bot locally:

```
	git clone https://github.com/CatalystCode/bot-to-bot-master.git
	cd bot-to-bot-master
	npm install
	npm start
```

* Run your slave bot locally on port 3978, or use the [following sample slave bot](https://github.com/CatalystCode/bot-to-bot-sub) for the demo.

* In order to start conversation with this bot, open the emulator, and use the following address: `http://localhost:3977/api/messages` without providing the App Id and Password.

* Type anything to start talking to the master bot. You'll get in response the step number you're in.

* In order to start routing messages to your slave bot, type `slave`. Since that moment, your messages will be routed to your slave bot. 

* To stop routing the messages to the slave bot and return control to the master bot, type `bye`. You should see that you got back to the next step in the dialog of the master bot.

* If you type `slave` again, you'll continue from the last step that you left the slave bot before resuming control to the master bot.







