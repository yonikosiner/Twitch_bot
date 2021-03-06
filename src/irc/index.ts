import { EventEmitter } from "events";
import bus from "../message-bus";
import Commands, { MessageFromYoni } from "./yoni-commands";
import vimCommand from "../vim-command";

import * as tmi from "tmi.js";
import SysCommands from "./system-command";
import bandCommands from "./band-commands";

enum IrcState {
    Waiting = 1,
    Connected = 2,
    Errored = 3
};

export type IrcTags = {
    "display-name": string;
}

type Emitter = (emitter: EventEmitter, tags: IrcTags, message: string) => void;

interface IrcClient extends EventEmitter {
    on(event: "from-yoni", cb: (message: MessageFromYoni) => void): this;
}

const channel = "#yonikosiner";

export default class IrcClientImpl extends EventEmitter implements IrcClient {
    private client: tmi.Client;
    private state: IrcState;
    private emitters: Emitter[];

    constructor(username: string, password: string) {
        super();
        this.state = IrcState.Waiting;
        this.emitters = [
            Commands,
            SysCommands,
        ];

        this.client = new tmi.Client({
            connection: {
                reconnect: true,
                secure: true
            },
            identity: {
                username: username,
                password: password,
            },
            channels: [ channel ]
        });

        this.client.connect().then(() => {
            this.state = IrcState.Connected;
            bus.emit("connected");
        }).catch((e: Error) => {
            this.state = IrcState.Errored;
            console.log("IRC Failed", e);
            bus.emit("error", e);
        });

        bus.on("irc-message", (msg: string) => {
            console.log("IRC#irc-message", msg);
            this.say(msg);
        });

        this.client.on("message", (_: string, tags: IrcTags, message: string): boolean | void => {
            vimCommand(tags, message);
            bandCommands(message, tags);
            if (message.startsWith("Thank you for following")) return bus.emit("follow", tags["display-name"]);
            if (message.startsWith("Thank you for subscribing")) return bus.emit("subscribe", tags["display-name"]);
            if (message.startsWith("!commands")) return bus.emit("irc-message", `@${tags["display-name"]} You can find the commands for the bot at https://github.com/yonikosiner/Twitch_bot/blob/master/commands.md`);
            bus.emit("message", `${tags["display-name"]}: ${message}`);
            this.emitters.forEach(e => e(bus, tags, message));
        });
    }

    say(str: string): void {
        if (this.state === IrcState.Waiting) {
            console.log("Unable to send", str);
            return;
        } else if (this.state === IrcState.Errored) {
            throw new Error("Cannot send messages, IRC errored.");
        };

        console.log("IRC#say", str);
        this.client.say(channel, str);
    }

    registerEmitter(emitter: Emitter): void {
        this.emitters.push(emitter);
    };
};
