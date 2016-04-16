var 	irc = require('irc'),
	config = require('./config/botconfig'),
	Sleep = require('sleep'),
	promise = require('bluebird');
var 	options = {
	promiseLib: promise
};
var 	pgp = require('pg-promise')(options);

var 	cn = {
	host : 'localhost',
	port : 5432,
	database : config.database.database,
	user : config.database.user,
	password : config.database.password
};

var db = pgp(cn);

var bot = new irc.Client(config.irc.server, config.irc.botName, {
} );

var outQueue = function(who, output ) {
	if( !Array.isArray(output ) ) {
		bot.say(who, output );
	} else {
		output.map( function(speech) {
			bot.say(who, speech );
			Sleep.usleep(800000 );
		} );
	}
};

var botQuit = function() {
	bot.disconnect("Bye!");
	pgp.end();
	process.exit();
};

var botCommand = function(nick, words, message, chan) {
	var out = [];
	if( chan === '') {
		chan = nick;
	}

	switch(words[0]) {
		case '!help':
			out = [];
			out.push('!number  : lists the number of notes ' + nick + ' has.');
			out.push('!add     : Adds a note with ' + nick + ' as the author.');
			out.push('!listall : Displays all notes ' + nick + ' has in the database.');
			out.push('!list    : Lists a notes id and a brief beginning of the note');
			out.push('!del     : Deletes a single note based on noteid from !list only authored by ' + nick + '.');
			out.push('!read    : Reads a single note based on noteid authored by ' + nick +  '.');
			outQueue(chan, out);
			break;
		case '!number':
			db.manyOrNone('SELECT doc from notetable where author = $1', nick)
			.then( function( data) {
				if( data.length === 0) {
					outQueue(chan, "Sorry " + nick + ", no notes from you");
				} else {
					outQueue( chan, nick + " you have " + data.length + " notes.");
				}
			})
			.catch( function( error) {
				console.log( "Error: " + error);
				botQuit();
			});
			break;
		case '!add':
			var data = "";

			data = words.slice(1).join(' ');
			if( data.length > 255) {
				data = data.slice(0, 255);
			}

			db.none('INSERT INTO notetable(author, doc) VALUES($1, $2)', [nick, data])
			.then( function() {
				outQueue(chan, nick + " note added.");
			})
			.catch( function(error) {
				console.log("Error: " + error);
				botQuit();
			});
			break;
		case '!listall':
			db.manyOrNone('SELECT doc FROM notetable WHERE author = $1', nick)
			.then( function(data) {
				if(data.length === 0) {
					outQueue( chan, "Sorry " + nick + ", no notes for you");
				} else {
					out = [];
					data.forEach( function( row ) {
						out.push(row.doc);
					});
					outQueue( chan, out);
				}
			})
			.catch( function(error) {
				console.log("Error: " + error);
				botQuit();
			});
			break;
		case '!del':
			db.manyOrNone('SELECT * FROM notetable WHERE noteid = $1 AND author = $2', [words[1], nick])
			.then( function(data) {
				if( data.length === 0) {
					out = [];
					out.push("Sorry " + nick + ", That note wasn't found.");
					out.push("Try !list");
					outQueue(chan, out);
				} else {
					db.none('DELETE FROM notetable WHERE noteid=$1 AND author=$2', [words[1], nick])
					.then( function(data) {
						outQueue( chan, "Record " + words[1] + " deleted");
					});
				}
			})
			.catch( function(error) {
				console.log("Error: " + error);
				botQuit();
			});
			break;
		case '!list':
			db.manyOrNone('SELECT noteid, doc FROM notetable WHERE author = $1', nick)
			.then( function(data) {
				if(data.length === 0) {
					outQueue(chan, "Sorry " + nick + ", no notes from you");
				} else {
					out = [];
					data.forEach( function( row ) {
						out.push( row.noteid + ":" + row.doc.substring(0, 15) );
					});
					outQueue( chan, out );
				}
			})
			.catch( function(error) {
				console.log("Error: " + error);
				botQuit();
			});
			break;
		case '!read':
			console.log(words[1]);
			db.manyOrNone('SELECT doc FROM notetable WHERE author = $1 AND noteid = $2', [nick, words[1]])
			.then( function(data) {
				if( data.length === 0) {
					console.log('oops');
					outQueue(chan, "Note not found!");
				} else {
					outQueue(chan, data[0].doc);
				}
			})
			.catch( function(error) {
				console.log("Error: " + error);
				botQuit();
			});

			break;
		default:
			// '!' is a common bot command identifier, if the command is not
			// list, ignore it.
			break;
	}
};

var channel_handler = function(nick, text, message ) {

	var words = text.split(' ');
	words[0] = words[0].toLowerCase();

	var chan = message.args[0]; 	//Channel name

	var out = []; 	//Output queue for outQueue
	if( words[0][0] !== '!') {
		return; 	//Not a bot command, and not a logging bot, so not interested
				//in the channel message
	}
	botCommand(nick, words, message, chan);

};

bot.addListener( "motd", function( motd ) {
	bot.say( "nickserv", "identify " + config.irc.nickPass );
} );

bot.addListener( "error", function( message ) {
	console.log( message );
} );

bot.addListener( "notice", function(nick, to, text, message) {
	if( to === config.irc.botName) {
		if( nick.toLowerCase() === "nickserv") {
			Sleep.usleep(800000);
			bot.join( config.irc.channels[0] );
		}
	}
});

bot.addListener( "pm", function( from, message ) {

	words = message.split( ' ' );
	words[0] = words[0].toLowerCase();

	if( words[0] === "!quit" && from === config.irc.botOwner) {
		bot.disconnect( "Yes Boss!" );
		pgp.end();
		process.exit();
	}
	botCommand( from, words, "", "");
} );

bot.addListener( "join", function( channel, nick, message ) {
	if( nick === config.irc.botName ) {
		bot.addListener( "message"+channel, channel_handler );
	}
} );

