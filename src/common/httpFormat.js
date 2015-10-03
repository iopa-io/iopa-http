/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
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
  
const constants = require('iopa').constants,
    IOPA = constants.IOPA,
    SERVER = constants.SERVER,
    HTTP = require('./constants.js').HTTP

const HTTPParser = require('./messageParser.js'),
      OutgoingHTTPMessageStream = require('./messageStream.js').OutgoingHTTPMessageStream;

/**
 * IOPA InboundParseMonitor converts inbound HTTP requests and inbound HTTP responses into IOPA Request and Response contexts
 *
 * @method inboundParseMonitor
 * @param channelContext (required) the transport context on which to parse the SERVER.RawStream message stream for one or more requests/responses;  typically TCP or UDP
 * @param context (optional) the IOPA Context on which to add the IOPA fields;  if blank new one(s) are created; optimization for non-session-oriented protocols such as UDP
 * @event IOPA.EVENTS.Request on channelContext[IOPA.Events]
 * @event IOPA.EVENTS.Response on channelContext[IOPA.Events]
 * @public
 */
module.exports.inboundParseMonitor = function HTTPFormat_parse(channelContext, context)
{
      return new Promise(function(resolve, reject){
        var parser = new HTTPParser(channelContext, context);
        channelContext[SERVER.RawStream].on("data", function(chunk) { parser.execute(chunk); });
        channelContext[SERVER.RawStream].on("finish", function() { 
          parser.finish(); 
          parser = null;
          resolve();
          });
    });  
}

/**
 * IOPA OutboundWrite converts outbound IOPA requests and outbound responses into HTTP messages
 * Buffers messages to only be writing a single request/response at a time for a given parent ChannelContext (for HTTP pipelining)
 *
 * @method outboundWrite
  * @param context (required) the IOPA Context which is to be written in HTTP Format to its parentContext's [SERVER.RawStream]
 * @returns Promise fulfilled when the write is complete (which may be a while if other requests are ahead in the queue for this channel)
 * @public
 */
module.exports.outboundWrite = function HTTPFormat_outboundWrite(context) {

  var p = new Promise(function (resolve, reject) {
    if (!context[SERVER.Capabilities][HTTP.CAPABILITY].resolve)
      context[SERVER.Capabilities][HTTP.CAPABILITY].resolve = resolve;
  })
  var channelContext = context[SERVER.ParentContext];

  if (!("outgoing" in channelContext[SERVER.Capabilities][HTTP.CAPABILITY]))
  {
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = null;
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing = [];
  }

  if (channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing == null) {
    // PROCESS IMMEDIATELY
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = context;

    var outgoingBodyStream = new OutgoingHTTPMessageStream(context);
    outgoingBodyStream.on("finish", _HttpFormat_outgoingComplete.bind(this, channelContext, context))

    if (context[IOPA.Body]) {
      if (typeof context[IOPA.Body] !== 'string' && !(context[IOPA.Body] instanceof Buffer))
        context[IOPA.Body].pipe(outgoingBodyStream);
      else
        outgoingBodyStream.end(context[IOPA.Body]);

    }
    else
      outgoingBodyStream.end();
  }
  else {
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.push(context);
  }

  return p;

}

/**
 * Utility method called by outboundWrite when the response is complete for a given context (context_finished)  on a specified channel
 * Starts writing the next context (context_next) in the queue and resolves the promise for the finished context (context_finished) 
 *
 * @method _HttpFormat_outgoingComplete
 * @param channelContext the IOPA Context which is to be written in HTTP Format to its parentContext's [SERVER.RawStream]
 * @param context_finished the context which has just finished
 * @returns void
 * @private
 */
function _HttpFormat_outgoingComplete(channelContext, context_finished) {
  channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = null;
  
  if (channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.length > 0) {
 
    var context_next = channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.shift();
    module.exports.outboundWrite(context_next);
    
    context_finished[SERVER.Capabilities][HTTP.CAPABILITY].resolve();
  }
  
    context_finished[SERVER.Capabilities][HTTP.CAPABILITY].resolve();
}
