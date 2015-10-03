/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 * Portions Copyright Node.js contributors. 
 * Portions Copyright Tim Caswell and other contributors.
 * See THIRDPARTY for details of original licenses.
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

/**
 * Class IOPA HTTPParser converts inbound HTTP requests and inbound HTTP responses into IOPA Request and Response contexts
 */

// DECLARATIONS

const iopa = require('iopa'),
    factory = new iopa.Factory(),
    iopaStream = require('iopa-common-stream');

const constants = iopa.constants,
    IOPA = constants.IOPA,
    SERVER = constants.SERVER,
    HTTP = require('./constants.js').HTTP

const OutgoingHTTPMessageStream = require('./messageStream.js').OutgoingHTTPMessageStream;

const util = require('util'),
    url = require('url'),
    assert = require('assert'),
    EventEmitter = require('events').EventEmitter;
    
const maxHeaderSize = 80 * 1024;

const HEADERSTATE = {
  HTTP_LINE: true, 
  HEADER: true
};

const STATEFINISHALLOWED = {
  HTTP_LINE: true,
  BODY_RAW: true
};


function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
 
 /**
 * IOPA HTTPParser converts inbound HTTP requests and inbound HTTP responses into IOPA Request and Response contexts
 *
 * @class HTTPParser
 * @param channelContext (required) the transport context on which to parse the SERVER.RawStream message stream for one or more requests/responses;  typically TCP or UDP
 * @param context (optional) the IOPA Context on which to add the IOPA fields;  if blank new one(s) are created; optimization for non-session-oriented protocols such as UDP
 * @event IOPA.EVENTS.Request on channelContext[IOPA.Events]
 * @event IOPA.EVENTS.Response on channelContext[IOPA.Events]
 * @constructor
 * @public
 */
function HTTPParser(channelContext, context) { 
  _classCallCheck(this, HTTPParser);
 if (channelContext)
 {
    this._channelContext = channelContext;
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].incoming = [];
    channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentIncoming = null;
 }
 
  this.context = context || this._createNewRequest();
  this.context[HTTP.SkipBody] = false;
  this.context[HTTP._shouldKeepAlive] = true;
  this.context[IOPA.Trailers] =[];
   
  this._state = 'HTTP_LINE';
  this._upgrade = false;
  this._line = '';
  this._isChunked = false;
  this._connection = '';
  this._headerSize = 0; 
  this._contentLength = null;
  
//  this._currentChunk;
//  this._offset;
//  this._end;
}

// PUBLIC METHODS

 /**
 * IOPA HTTPParser execute method called for each chunk in input stream
 *
 * @method execute
 * @param chunk the Node buffer containing the chunk to process; may contain partial, all or multiple HTTP messages
 * @public
 */
HTTPParser.prototype.execute = function (chunk) {
  _classCallCheck(this, HTTPParser);
  console.log(chunk.toString());
  var start = 0;
  var length = chunk.length;

  this._currentChunk = chunk;
  this._offset = start;
  var end = this._end = start + length;
     while (this._offset < end) {
      if (this[this._state]()) {
        break;
      }
    }
  this._currentChunk = null;
  
  length = this._offset - start
  if (HEADERSTATE[this._state]) {
    this._headerSize += length;
    if (this._headerSize > maxHeaderSize) {
      throw new Error('max header size exceeded');
    }
  }
  return length;
};

/**
 * IOPA HTTPParser execute method called for each chunk in input stream
 *
 * @method execute
 * @param chunk the Node buffer containing the chunk to process; may contain partial, all or multiple HTTP messages
 * @public
 */
HTTPParser.prototype.finish = function () {
   if (!STATEFINISHALLOWED[this._state]) {
    throw new Error('invalid state for EOF');
  }
  if (this._state === 'BODY_RAW') {
      this._onMessageComplete();
    }
};

// PRIVATE METHODS FOR MAJOR PARSING MILESTONES

HTTPParser.prototype._onHeadersComplete = function() {
    this.context[IOPA.Scheme] = IOPA.SCHEMES.HTTP;
    this.context[IOPA.Body] = new iopaStream.IncomingStream();
    
    var response = this.context.response;
    response[IOPA.Body] = new OutgoingHTTPMessageStream(response);
    response[IOPA.StatusCode] = 200;
    response[IOPA.ReasonPhrase] = "OK";
    response[IOPA.Protocol] = this.context[IOPA.Protocol];
    response[IOPA.Scheme] = this.context[IOPA.Scheme];
      
    if (this._channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentIncoming == null)
    {
     // PROCESS IMMEDIATELY
      this._channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentIncoming = this.context;
      response[IOPA.Body].on("finish",  this._onResponseComplete.bind(this))
            
      if (this.context[SERVER.IsRequest])
        this._channelContext[IOPA.Events].emit(IOPA.EVENTS.Request, this.context)
      else
        this._channelContext[IOPA.Events].emit(IOPA.EVENTS.Response, this.context)
    } else{
      // CACHE PROCESSING UNTIL CURRENT MESSAGE IS DONE
       this._channelContext[SERVER.Capabilities][HTTP.CAPABILITY].incoming.push(this.context);
    }
       
    return false;
}

HTTPParser.prototype._onResponseComplete = function () {
  var incoming = this._channelContext[SERVER.Capabilities][HTTP.CAPABILITY].incoming;

  if (incoming.length == 0) {
    this._channelContext[SERVER.RawStream].destroySoon();
    return;
  }

  var context = incoming.shift();
  this._channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentIncoming = context;

  if (context[SERVER.IsRequest])
    this._channelContext[IOPA.Events].emit(IOPA.EVENTS.Request, context)
  else
    this._channelContext[IOPA.Events].emit(IOPA.EVENTS.Response, context)

}

HTTPParser.prototype._onBody = function(chunk, offset, length) {
     this.context[IOPA.Body].append(chunk.slice(offset, offset+length));
}

HTTPParser.prototype._onMessageComplete = function(result) {
   this.context[IOPA.Body].close();
   }


// PRIVATE HELPER METHODS

HTTPParser.prototype._createNewRequest = function () {
  var parentContext = this._channelContext;
  var parentResponse = parentContext.response;
  
  var context = parentContext[SERVER.Factory].createContext();
  var response = context.response;

  parentContext[SERVER.Factory].mergeCapabilities(context, parentContext);

  context[SERVER.SessionId] = parentResponse[SERVER.SessionId];
  context[SERVER.TLS] = parentContext[SERVER.TLS];

  context[SERVER.IsLocalOrigin] = false;

  context[SERVER.RemoteAddress] = parentContext[SERVER.RemoteAddress];
  context[SERVER.RemotePort] = parentContext[SERVER.RemotePort];
  context[SERVER.LocalAddress] = parentContext[SERVER.LocalAddress];
  context[SERVER.LocalPort] = parentContext[SERVER.LocalPort];
  context[SERVER.RawStream] = parentContext[SERVER.RawStream];
  response[SERVER.RawStream] = parentResponse[SERVER.RawStream];
 

  response[SERVER.TLS] = context[SERVER.TLS];
  response[SERVER.RemoteAddress] = context[SERVER.RemoteAddress];
  response[SERVER.RemotePort] = context[SERVER.RemotePort];
  response[SERVER.LocalAddress] = context[SERVER.LocalAddress];
  response[SERVER.LocalPort] = context[SERVER.LocalPort];

  context[SERVER.Fetch] = parentContext[SERVER.Fetch];
  context[SERVER.Dispatch] = parentContext[SERVER.Dispatch];
 
  return context;
}


HTTPParser.prototype._reinitialize = HTTPParser;


HTTPParser.prototype._nextRequest = function () {
  this._onMessageComplete();
  this._reinitialize();
};

HTTPParser.prototype._consumeLine = function () {
  var end = this._end,
      chunk = this._currentChunk;
  for (var i = this._offset; i < end; i++) {
    if (chunk[i] === 0x0a) { // \n
      var line = this._line + chunk.toString('ascii', this._offset, i);
      if (line.charAt(line.length - 1) === '\r') {
        line = line.substr(0, line.length - 1);
      }
      this._line = '';
      this._offset = i + 1;
      return line;
    }
  }
  this._line += chunk.toString('ascii', this._offset, this._end);
  this._offset = this._end;
};


HTTPParser.prototype._shouldKeepAlive = function () {
  if (this.context[IOPA.Protocol] == 'HTTP/1.1') {
    if (this._connection.indexOf('close') !== -1) {
      return false;
    }
  } else if (this._connection.indexOf('keep-alive') === -1) {
    return false;
  }
  if (this._contentLength !== null || this._isChunked) { 
    return true;
  }
  return false;
};


// PRIVATE METHODS FOR EACH PARSING STATE: 
// HTTP_LINE, HEADER, BODY_CHUNKHEAD, BODY_CHUNK, BODY_CHUNKEMPTYLINE, BODY_CHUNKTRAILERS, BODY_RAW, BODY_SIZED

var httpHeader = /HTTP\/\d{1}\.\d{1} \d+ .*/
HTTPParser.prototype.HTTP_LINE = function () {
    var line = this._consumeLine();
    if (line === undefined) {
        return;
    }
    
     if (httpHeader.test(line)) {
            this._parseResponseLine(line)
        } else {
            this._parseRequestLine(line)
        }
};

var requestExp = /^([A-Z-]+) ([^ ]+) (HTTP\/\d\.\d)$/;
HTTPParser.prototype._parseRequestLine = function (line) {
  var match = requestExp.exec(line);
  if (match === null) {
    var err = new Error('Parse Error');
    err.code = 'HPE_INVALID_CONSTANT';
    throw err;
  }
  
  var method =  match[1];
  
  if (HTTP.METHODS.indexOf(method) === -1) {
    throw new Error('invalid request method');
  }
  
  if (method  === 'CONNECT') {
    this._upgrade = true;
  }
    
  this.context[IOPA.Method] = method;
  var urlParsed = url.parse(match[2]);
  this.context[IOPA.Path] = urlParsed.pathname;
  this.context[IOPA.PathBase] = "";
  this.context[IOPA.QueryString] = urlParsed.query;
  this.context[IOPA.Protocol] = match[3];
  this.context[SERVER.IsRequest] = true;
   
  this._contentLength = 0;
  this._state = 'HEADER';
};

var responseExp = /^(HTTP\/\d\.\d) (\d{3}) ?(.*)$/;
HTTPParser.prototype._parseResponseLine = function (line) {
  var match = responseExp.exec(line);
  if (match === null) {
    var err = new Error('Parse Error');
    err.code = 'HPE_INVALID_CONSTANT';
    throw err;
  }

  this.context[IOPA.Protocol] = match[1];
  var statusCode = this.context[IOPA.StatusCode] = +match[2];
  this.context[IOPA.ReasonPhrase] = match[3];
 
  if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
    this._contentLength = 0;
  }
 this.context[SERVER.IsRequest] = false;
 
  this._state = 'HEADER';
};


HTTPParser.prototype.HEADER = function () {
  var line = this._consumeLine();
  if (line === undefined) {
    return;
  }
  if (line) {
    this._parseHeader(line, this.context[IOPA.Headers]);
  } else {
    var headers = this.context[IOPA.Headers];
    for (var k in headers) {
      if (headers.hasOwnProperty(k)) {
        switch (k.toLowerCase()) {
          case 'transfer-encoding':
            this._isChunked = headers[k].toLowerCase() === 'chunked';
            break;
          case 'content-length':
            this._contentLength = +headers[k];
            break;
          case 'connection':
            this._connection += headers[k].toLowerCase();
            break;
          case 'upgrade':
            this._upgrade = true;
            break;
        }
      }
    }
    
    this.context[HTTP._shouldKeepAlive] = this._shouldKeepAlive();

    var skipBody = this._onHeadersComplete();
    
    if (this._upgrade) {
      this._nextRequest();
      return true;
    } else if (this._isChunked && !skipBody) {
      this._state = 'BODY_CHUNKHEAD';
    } else if (skipBody || this._contentLength === 0) {
      this._nextRequest();
    } else if (this._contentLength === null) {
      this._state = 'BODY_RAW';
    } else {
      this._state = 'BODY_SIZED';
    }
  }
};

var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
var headerContinueExp = /^[ \t]+(.*[^ \t])/;
HTTPParser.prototype._parseHeader = function (line, headers) {
  var match = headerExp.exec(line);
  var k = match && match[1];
  if (k) {
    if (headers.hasOwnProperty(k)) {
      headers[k] = headers[k] + "," + match[2];
    }
    else {
      headers[k] = match[2];
    }
  }
  else {
    var matchContinue = headerContinueExp.exec(line);
    if (matchContinue && headers.length) {
      k = Object.keys(headers)[Object.keys(headers).length - 1];
      if (headers[k]) {
        headers[k] += ' ';
      }
      headers[k] += matchContinue[1];
    }
  }
};     

HTTPParser.prototype.BODY_CHUNKHEAD = function () {
  var line = this._consumeLine();
  if (line === undefined) {
    return;
  }
  this._contentLength = parseInt(line, 16);
  if (!this._contentLength) {
    this._state = 'BODY_CHUNKTRAILERS';
  } else {
    this._state = 'BODY_CHUNK';
  }
};

HTTPParser.prototype.BODY_CHUNK = function () {
  var length = Math.min(this._end - this._offset, this._contentLength);
  this._onBody(this._currentChunk, this._offset, length);
  this._offset += length;
  this._contentLength -= length;
  if (!this._contentLength) {
    this._state = 'BODY_CHUNKEMPTYLINE';
  }
};

HTTPParser.prototype.BODY_CHUNKEMPTYLINE = function () {
  var line = this._consumeLine();
  if (line === undefined) {
    return;
  }
  assert.equal(line, '');
  this._state = 'BODY_CHUNKHEAD';
};

HTTPParser.prototype.BODY_CHUNKTRAILERS = function () {
  var line = this._consumeLine();
  if (line === undefined) {
    return;
  }
  if (line) {
    this._parseHeader(line, this.context[IOPA.Trailers]);
  } else {
    if (this.context[IOPA.Trailers].length) {
      this._onHeaders();
    }
    this._nextRequest();
  }
};

HTTPParser.prototype.BODY_RAW = function () {
  var length = this._end - this._offset;
  this._onBody(this._currentChunk, this._offset, length);
  this._offset = this._end;
};

HTTPParser.prototype.BODY_SIZED = function () {
  var length = Math.min(this._end - this._offset, this._contentLength);
  this._onBody(this._currentChunk, this._offset, length);
  this._offset += length;
  this._contentLength -= length;
  if (!this._contentLength) {
    this._nextRequest();
  }
};

 
 // MODULE EXPORTS

module.exports = HTTPParser;