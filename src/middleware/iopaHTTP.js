/*
 * Copyright (c) 2016 Internet of Protocols Alliance (IOPA)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const iopa = require('iopa'),
  iopaStream = require('iopa-common-stream'),
  httpFormat = require('../common/httpFormat')

const constants = iopa.constants,
  IOPA = constants.IOPA,
  SERVER = constants.SERVER,
  HTTP = require('../common/constants.js').HTTP

const packageVersion = require('../../package.json').version;

/**
* IOPA Middleware for Hypertext Transfer Protocol (HTTP) protocol
*
* @class IopaHttp
* @this app.properties  the IOPA AppBuilder Properties Dictionary, used to add server.capabilities
* @constructor
* @public
*/
function IopaHttp(app) {
  app.properties[SERVER.Capabilities][HTTP.CAPABILITY] = {};
  app.properties[SERVER.Capabilities][HTTP.CAPABILITY][SERVER.Version] = packageVersion;
  app.properties[SERVER.Capabilities][HTTP.CAPABILITY][IOPA.Protocol] = HTTP.PROTOCOLVERSION;

  this.app = app;
}

/**
 * channel method called for each inbound transport session channel
 * 
 * @method invoke
 * @this IopaHttp 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.invoke = function IopaHttp_invoke(channelContext, next) {

  return new Promise(function (resolve, reject) {
    channelContext[IOPA.Events].on(IOPA.EVENTS.Request, function (context) {
      context.response[IOPA.Headers]['Cache-Control'] = HTTP.CACHE_CONTROL;
      context.response[IOPA.Headers]['Server'] = HTTP.SERVER;
      context.response[IOPA.Body].on("start", function () {
        httpFormat.outboundWrite(context.response);
      });
      context.using(next.invoke);
    })

    channelContext[IOPA.Events].on("close", resolve);

    httpFormat.inboundParseMonitor(channelContext, null);
  });
}

/**
 * connect method called for each outbound client.connect() channelContext creation
 * 
 * @method connect
 * @this IopaHttp 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.dispatch = function IopaHttp_dispatch(channelContext, next) {
  channelContext.create = this.create.bind(this, channelContext, channelContext.create);
  
  return next().then(function () {
    httpFormat.inboundParseMonitor(channelContext, null);
    return channelContext;
  })
};

/**
 * Creates a new IOPA Context that is a child request/response of a parent Context
 *
 * @method create
 *
 * @param parentContext IOPA Context for parent
 * @param next IOPA application delegate for the remainder of the createContext pipeline
 * @param url string representation of /hello
 * @param options object 
 * @returns context
 * @public
 */
IopaHttp.prototype.create = function IopaHttp_create(parentContext, next, url, options) {
  var context = next(url, options);
  context[SERVER.IsRequest] = true;
  context[IOPA.Method] = "GET";
  context[IOPA.Headers]['Cache-Control'] = HTTP.CACHE_CONTROL;
  context[IOPA.Headers]['Server'] = HTTP.SERVER;
  context[IOPA.Body] = new iopaStream.OutgoingMessageStream();
  context[IOPA.Body].on("start", function () {
    return httpFormat.outboundWrite(context);
  });
  return context;
};

module.exports = IopaHttp;
