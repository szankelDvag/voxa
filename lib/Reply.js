/**
 * Alexa Reply
 *
 * See message-renderer to see the msg structure that
 * Reply expects.
 *
 * Copyright (c) 2016 Rain Agency.
 * Licensed under the MIT license.
 */

'use strict';

const _ = require('lodash');
const AlexaEvent = require('./AlexaEvent');

const SSML = 'SSML';

class Reply {
  constructor(alexaEvent, msg) {
    if (!(alexaEvent instanceof AlexaEvent)) {
      throw new Error('First argument of Reply must be an AlexaEvent');
    }

    this.alexaEvent = alexaEvent;
    this.session = alexaEvent.session;
    this.msg = {
      statements: [],
      reprompt: '',
      card: undefined,
      yield: false,
      hasAnAsk: false,
      directives: [],
    };
    this.append(msg);
  }

  append(msg) {
    if (!msg) return this;
    if (msg instanceof Reply) return this.appendReply(msg);
    if (_.isArray(msg)) {
      _.map(msg, m => this.append(m));
      return this;
    }

    const statement = msg.ask || msg.tell || msg.say;
    if (statement) {
      if (this.msg.yield) {
        throw new Error('Can\'t append to already yielding response');
      }
      this.msg.statements.push(statement);
    }

    this.msg.reprompt = msg.reprompt || this.msg.reprompt;
    this.msg.card = msg.card || this.msg.card;
    this.msg.yield = this.msg.yield || !!(msg.ask || msg.tell);
    this.msg.hasAnAsk = this.msg.hasAnAsk || !!msg.ask;

    msg.supportDisplayInterface = msg.supportDisplayInterface ||
      hasSupportForDisplay(this.alexaEvent);

    this.msg.directives = this.msg.directives
    .concat(cannonicalizeDirectives(this.alexaEvent, msg));
    return this;
  }

  appendReply(reply) {
    this.msg.statements = _.concat(this.msg.statements, reply.msg.statements);
    this.msg.yield = this.msg.yield || reply.isYielding();
    this.msg.hasAnAsk = this.msg.hasAnAsk || reply.msg.hasAnAsk;

    reply.supportDisplayInterface = reply.supportDisplayInterface ||
      hasSupportForDisplay(this.alexaEvent);

    this.msg.reprompt = reply.msg.reprompt || this.msg.reprompt;
    this.msg.card = reply.msg.card || this.msg.card;
    this.msg.directives = this.msg.directives
    .concat(cannonicalizeDirectives(this.alexaEvent, reply.msg));

    return this;
  }

  end() {
    this.msg.yield = true;
    return this;
  }

  isYielding() {
    return this.msg.yield;
  }

  toJSON() {
    const say = Reply.wrapSpeech(Reply.toSSML(this.msg.statements.join('\n')));
    const reprompt = Reply.wrapSpeech(Reply.toSSML(this.msg.reprompt));
    const directives = this.msg.directives;
    const isAsk = !!this.msg.hasAnAsk;

    const alexaResponse = {
      outputSpeech: Reply.createSpeechObject(say),
      shouldEndSession: !isAsk,
      card: this.msg.card,
    };

    if (reprompt && isAsk) {
      alexaResponse.reprompt = {
        outputSpeech: Reply.createSpeechObject(reprompt),
      };
    }
    if (directives && directives.length > 0) alexaResponse.directives = directives;

    const returnResult = {
      version: '1.0',
      response: alexaResponse,
    };

    if (this.session && !_.isEmpty(this.session.attributes)) {
      returnResult.sessionAttributes = this.session.attributes;
    } else {
      returnResult.sessionAttributes = {};
    }

    return returnResult;
  }

  static toSSML(statement) {
    if (!statement) return undefined;
    if (statement.lastIndexOf('<speak>', 0) >= 0) return statement; // lastIndexOf is a pre Node v6 idiom for startsWith
    statement = statement.replace(/&/g, '&amp;'); // Hack. Full xml escaping would be better, but the & is currently the only special character used.
    return `<speak>${statement}</speak>`;
  }

  static wrapSpeech(statement) {
    if (!statement) return undefined;
    return { speech: statement, type: SSML };
  }

  static createSpeechObject(optionsParam) {
    if (!optionsParam) return undefined;
    if (optionsParam && optionsParam.type === 'SSML') {
      return {
        type: optionsParam.type,
        ssml: optionsParam.speech,
      };
    }
    return {
      type: optionsParam.type || 'PlainText',
      text: optionsParam.speech || optionsParam,
    };
  }

}

function hasSupportForDisplay(alexaEvent) {
  return _.get(alexaEvent, 'context.System.device.supportedInterfaces.Display');
}

function cannonicalizeDirectives(alexaEvent, msg) {
  let directives = msg.directives;
  if (!directives) return [];
  if (!_.isArray(directives)) directives = [directives];

  directives = directives
  .filter(directive => filterDisplayInterface(alexaEvent, directive, msg))
  .map(cannonicalizeDirective);

  if (_.filter(directives, { type: 'Display.RenderTemplate' }).length > 1) {
    throw new Error('At most one Display.RenderTemplate directive can be specified in a response');
  }

  if (_.filter(directives, { type: 'Hint' }).length > 1) {
    throw new Error('At most one Hint directive can be specified in a response');
  }

  if (_.find(directives, { type: 'AudioPlayer.Play' }) && _.find(directives, { type: 'VideoApp.Launch' })) {
    throw new Error('Do not include both an AudioPlayer.Play directive and a VideoApp.Launch directive in the same response');
  }

  return directives;
}

function filterDisplayInterface(alexaEvent, directive, msg) {
  if (!msg.supportDisplayInterface && _.includes(['Display.RenderTemplate', 'Hint'], directive.type)) return false;
  return true;
}

function cannonicalizeDirective(directive) {
  // Custom hint directive
  if (_.isString(directive.hint) && !_.isEmpty(directive.hint)) {
    return {
      type: 'Hint',
      hint: {
        type: 'PlainText',
        text: directive.hint,
      },
    };
  }

  // Custom play directive
  if (directive.playBehavior && (directive.token || directive.url)) {
    return {
      type: directive.type,
      playBehavior: directive.playBehavior,
      audioItem: {
        stream: {
          token: directive.token,
          url: directive.url,
          offsetInMilliseconds: directive.offsetInMilliseconds,
        },
      },
    };
  }

  return directive;
}

module.exports = Reply;
