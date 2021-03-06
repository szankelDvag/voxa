'use strict';

const _ = require('lodash');

class AlexaEvent {
  constructor(event, lambdaContext) {
    _.merge(this, {
      session: {
        attributes: {},
      },
      request: {},
    }, event);

    if (_.isEmpty(_.get(this, 'session.attributes'))) {
      _.set(this, 'session.attributes', {});
    }

    this.lambdaContext = lambdaContext;
    this.intent = new Intent(this.request.intent);
  }

  get user() {
    return _.get(this, 'session.user') || _.get(this, 'context.System.user');
  }

  get device() {
    return _.get(this, 'context.System.device');
  }

  get token() {
    return _.get(this, 'request.token');
  }
}

class Intent {
  constructor(rawIntent) {
    _.merge(this, rawIntent);
  }

  get params() {
    return _(this.slots)
      .map(s => [s.name, s.value])
      .fromPairs()
      .value();
  }

  get valid() {
    return _.filter(
        _.flatten(
          _.map(this.slots, (slot) => _.get(slot, 'resolutions.resolutionsPerAuthority'))),
      (slot) => slot ? slot.status.code !== 'ER_SUCCESS_MATCH': true)
        .length === 0;
  }
}

module.exports = AlexaEvent;
