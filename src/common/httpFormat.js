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

const iopa = require('iopa'),
    factory = new iopa.Factory(),
    iopaStream = require('iopa-common-stream');

const constants = iopa.constants,
    IOPA = constants.IOPA,
    SERVER = constants.SERVER;

const util = require('util'),
    url = require('url'),
    assert = require('assert'),
    EventEmitter = require('events').EventEmitter;
    
const HTTP = {
  ShouldKeepAlive: "http.ShouldKeepAlive",
  SkipBody: "http.SkipBody",
  CAPABILITY: "urn:io.iopa:http",

  METHODS: [
    'CHECKOUT',
    'CONNECT',
    'COPY',
    'DELETE',
    'GET',
    'HEAD',
    'LOCK',
    'M-SEARCH',
    'MERGE',
    'MKACTIVITY',
    'MKCALENDAR',
    'MKCOL',
    'MOVE',
    'NOTIFY',
    'OPTIONS',
    'PATCH',
    'POST',
    'PROPFIND',
    'PROPPATCH',
    'PURGE',
    'PUT',
    'REPORT',
    'SEARCH',
    'SUBSCRIBE',
    'TRACE',
    'UNLOCK',
    'UNSUBSCRIBE',
  ]
}

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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

module.exports.write = function HTTPFormat_write(context)
{
  
  var p = new Promise(function(resolve, reject){
      if (!context[SERVER.Capabilities][HTTP.CAPABILITY].resolve)
        context[SERVER.Capabilities][HTTP.CAPABILITY].resolve = resolve;
    })
  var channelContext = context[SERVER.ParentContext]; 
  if (channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing == null)
    {
     // PROCESS IMMEDIATELY
       channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = context;
      
        var outgoingBodyStream = new OutgoingHTTPMessageStream(context);
        outgoingBodyStream.on("finish", HttpFormat_outgoingComplete.bind(this, channelContext, context))
        
        if (context[IOPA.Body])
          {
            if (typeof context[IOPA.Body] !== 'string' && !(context[IOPA.Body] instanceof Buffer)) 
                context[IOPA.Body].pipe(outgoingBodyStream);
            else
                outgoingBodyStream.end(context[IOPA.Body]);
    
          }
          else
            outgoingBodyStream.end();
    }
    else
    {
      channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.push(context);
    }
    
    return p;
    
}

var HttpFormat_outgoingComplete = function(channelContext, context) {
  channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = null;
  
  if (channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.length == 0)
  {
      context[SERVER.Capabilities][HTTP.CAPABILITY].resolve();
       return;
  }
  var context = channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing.shift();
  module.exports.write(context);
  context[SERVER.Capabilities][HTTP.CAPABILITY].resolve();
}

/**
 * HTTP Parser for IOPA
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
  this.context[HTTP.ShouldKeepAlive] = true;
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

HTTPParser.prototype.onHeadersComplete = function() {
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
      response[IOPA.Body].on("finish",  this.onResponseComplete.bind(this))
            
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

HTTPParser.prototype.onResponseComplete = function () {
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

HTTPParser.prototype.onBody = function(chunk, offset, length) {
     this.context[IOPA.Body].append(chunk.slice(offset, offset+length));
}

HTTPParser.prototype._onMessageComplete = function(result) {
   this.context[IOPA.Body].close();
   }

HTTPParser.prototype.reinitialize = HTTPParser;

const maxHeaderSize = 80 * 1024;

const HEADERSTATE = {
  HTTP_LINE: true, 
  HEADER: true
};

const STATEFINISHALLOWED = {
  HTTP_LINE: true,
  BODY_RAW: true
};

HTTPParser.prototype.execute = function (chunk) {
  _classCallCheck(this, HTTPParser);
  
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

HTTPParser.prototype.finish = function () {
   if (!STATEFINISHALLOWED[this._state]) {
    throw new Error('invalid state for EOF');
  }
  if (this._state === 'BODY_RAW') {
      this._onMessageComplete();
    }
};

HTTPParser.prototype.nextRequest = function () {
  this._onMessageComplete();
  this.reinitialize();
};

HTTPParser.prototype.consumeLine = function () {
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

var httpHeader = /HTTP\/\d{1}\.\d{1} \d+ .*/
HTTPParser.prototype.HTTP_LINE = function () {
    var line = this.consumeLine();
    if (line === undefined) {
        return;
    }
    
     if (httpHeader.test(line)) {
            this.parseResponseLine(line)
        } else {
            this.parseRequestLine(line)
        }
};

var requestExp = /^([A-Z-]+) ([^ ]+) (HTTP\/\d\.\d)$/;
HTTPParser.prototype.parseRequestLine = function (line) {
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
HTTPParser.prototype.parseResponseLine = function (line) {
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

HTTPParser.prototype.shouldKeepAlive = function () {
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

HTTPParser.prototype.HEADER = function () {
  var line = this.consumeLine();
  if (line === undefined) {
    return;
  }
  if (line) {
    this.parseHeader(line, this.context[IOPA.Headers]);
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
    
    this.context[HTTP.ShouldKeepAlive] = this.shouldKeepAlive();

    var skipBody = this.onHeadersComplete();
    
    if (this._upgrade) {
      this.nextRequest();
      return true;
    } else if (this._isChunked && !skipBody) {
      this._state = 'BODY_CHUNKHEAD';
    } else if (skipBody || this._contentLength === 0) {
      this.nextRequest();
    } else if (this._contentLength === null) {
      this._state = 'BODY_RAW';
    } else {
      this._state = 'BODY_SIZED';
    }
  }
};

var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
var headerContinueExp = /^[ \t]+(.*[^ \t])/;
HTTPParser.prototype.parseHeader = function (line, headers) {
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
  var line = this.consumeLine();
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
  this.onBody(this._currentChunk, this._offset, length);
  this._offset += length;
  this._contentLength -= length;
  if (!this._contentLength) {
    this._state = 'BODY_CHUNKEMPTYLINE';
  }
};

HTTPParser.prototype.BODY_CHUNKEMPTYLINE = function () {
  var line = this.consumeLine();
  if (line === undefined) {
    return;
  }
  assert.equal(line, '');
  this._state = 'BODY_CHUNKHEAD';
};

HTTPParser.prototype.BODY_CHUNKTRAILERS = function () {
  var line = this.consumeLine();
  if (line === undefined) {
    return;
  }
  if (line) {
    this.parseHeader(line, this.context[IOPA.Trailers]);
  } else {
    if (this.context[IOPA.Trailers].length) {
      this._onHeaders();
    }
    this.nextRequest();
  }
};

HTTPParser.prototype.BODY_RAW = function () {
  var length = this._end - this._offset;
  this.onBody(this._currentChunk, this._offset, length);
  this._offset = this._end;
};

HTTPParser.prototype.BODY_SIZED = function () {
  var length = Math.min(this._end - this._offset, this._contentLength);
  this.onBody(this._currentChunk, this._offset, length);
  this._offset += length;
  this._contentLength -= length;
  if (!this._contentLength) {
    this.nextRequest();
  }
};



// OUTGOING MESSAGE

const CRLF = '\r\n';
const CRLF_BUF = new Buffer('\r\n');


const timers = require('timers');
const Stream = require('stream');

const automaticHeaders = {
  connection: true,
  'content-length': true,
  'transfer-encoding': true,
  date: true
};

var dateCache;
function utcDate() {
  if (!dateCache) {
    var d = new Date();
    dateCache = d.toUTCString();
    timers.enroll(utcDate, 1000 - d.getMilliseconds());
    timers._unrefActive(utcDate);
  }
  return dateCache;
}
utcDate._onTimeout = function() {
  dateCache = undefined;
};

function OutgoingHTTPMessageStream(context) {
  Stream.call(this);
  this.context = context;
  
  this.output = [];
  this.outputEncodings = [];
  this.outputCallbacks = [];

  this.writable = true;

  this._last = false;
  this.chunkedEncoding = false;
  this.shouldKeepAlive = true;
  this.useChunkedEncodingByDefault = true;
  this.sendDate = false;
  this._removedHeader = {};

  this._contentLength = null;
  this._hasBody = true;
  this._trailer = '';

  this.finished = false;
  this._headerSent = false;

  this.socket = null;
  this.connection = null;
  this._header = null;
  this._headers = null;
  this._headerNames = {};
}
util.inherits(OutgoingHTTPMessageStream, Stream);

exports.OutgoingMessage = OutgoingHTTPMessageStream;

OutgoingHTTPMessageStream.prototype.writeContinue = function(cb) {
  this._writeRaw('HTTP/1.1 100 Continue' + CRLF + CRLF, 'ascii', cb);
  this._sent100 = true;
};

OutgoingHTTPMessageStream.prototype.writeHead = function() {
  this.emit("start");
  
   if (this.context[SERVER.IsRequest])
     this._writeHeadRequest()
   else
      this._writeHeadResponse()
  
};

OutgoingHTTPMessageStream.prototype._writeHeadRequest = function() {
  
  var statusLine = this.context[IOPA.Method]
    + ' ' 
    + this.context[IOPA.Path] 
    + ' ' 
    + this.context[IOPA.Protocol] 
    + CRLF;
    
  this._writeHeadCommon(statusLine);
};

OutgoingHTTPMessageStream.prototype._writeHeadResponse = function() {
  var statusCode = this.context[IOPA.StatusCode];
  var statusLine = this.context[IOPA.Protocol] + ' ' + statusCode.toString() + ' ' +
                   this.context[IOPA.ReasonPhrase] + CRLF;

  if (statusCode === 204 || statusCode === 304 ||
      (100 <= statusCode && statusCode <= 199)) {
     this._hasBody = false;
  }

  // don't keep alive connections where the client expects 100 Continue
  // but we sent a final status; they may put extra bytes on the wire.
  if (this._expect_continue && !this._sent100) {
    this.shouldKeepAlive = false;
  }

  this._writeHeadCommon(statusLine);
};

OutgoingHTTPMessageStream.prototype._writeHeadCommon = function(firstLine) {
  // firstLine in the case of request is: 'GET /index.html HTTP/1.1\r\n'
  // in the case of response it is: 'HTTP/1.1 200 OK\r\n'
  var state = {
    sentConnectionHeader: false,
    sentContentLengthHeader: false,
    sentTransferEncodingHeader: false,
    sentDateHeader: false,
    sentExpect: false,
    sentTrailer: false,
    messageHeader: firstLine
  };
 
  var headers = this.context[IOPA.Headers];

  var keys = Object.keys(headers);
  var isArray = Array.isArray(headers);
  var field, value;

  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    if (isArray) {
      field = headers[key][0];
      value = headers[key][1];
    } else {
      field = key;
      value = headers[key];
    }

    if (Array.isArray(value)) {
      for (var j = 0; j < value.length; j++) {
        storeHeader(this, state, field, value[j]);
      }
    } else {
      storeHeader(this, state, field, value);
    }
  }

  // Date header
  if (this.sendDate === true && state.sentDateHeader === false) {
    state.messageHeader += 'Date: ' + utcDate() + CRLF;
  }

  // Force the connection to close when the response is a 204 No Content or
  // a 304 Not Modified and the user has set a "Transfer-Encoding: chunked"
  // header.
  var statusCode = this.statusCode;
  if ((statusCode === 204 || statusCode === 304) &&
      this.chunkedEncoding === true) {
     this.chunkedEncoding = false;
    this.shouldKeepAlive = false;
  }

  // keep-alive logic
  if (this._removedHeader.connection) {
    this._last = true;
    this.shouldKeepAlive = false;
  } else if (state.sentConnectionHeader === false) {
    var shouldSendKeepAlive = this.shouldKeepAlive &&
        (state.sentContentLengthHeader ||
         this.useChunkedEncodingByDefault ||
         this.agent);
    if (shouldSendKeepAlive) {
      state.messageHeader += 'Connection: keep-alive\r\n';
    } else {
      this._last = true;
      state.messageHeader += 'Connection: close\r\n';
    }
  }

  if (state.sentContentLengthHeader === false &&
      state.sentTransferEncodingHeader === false) {
    if (!this._hasBody) {
      // Make sure we don't end the 0\r\n\r\n at the end of the message.
      this.chunkedEncoding = false;
    } else if (!this.useChunkedEncodingByDefault) {
      this._last = true;
    } else {
      if (!state.sentTrailer &&
          !this._removedHeader['content-length'] &&
          typeof this._contentLength === 'number') {
        state.messageHeader += 'Content-Length: ' + this._contentLength +
                               '\r\n';
      } else if (!this._removedHeader['transfer-encoding']) {
        state.messageHeader += 'Transfer-Encoding: chunked\r\n';
        this.chunkedEncoding = true;
      } else {
        // We should only be able to get here if both Content-Length and
        // Transfer-Encoding are removed by the user.
       }
    }
  }

  // store in this._header ready to be sent with first chunk
  this._header = state.messageHeader + CRLF;
  this._headerSent = false;
 // wait until the first body chunk, or close(), is sent to flush,
  // UNLESS we're sending Expect: 100-continue.
  if (state.sentExpect) this._send('');
};

/** 
 * Regex expressions for storeHeader
 */
const CHUNK_EXPRESSION = /chunk/i,
  CONTINUE_EXPRESSION = /100-continue/i,
  CONNECTION_EXPRESSION = /^Connection$/i,
  TRANSFERCODING_EXPRESSION = /^Transfer-Encoding$/i,
  CLOSE_EXPRESSION = /close/i,
  CONTENTLENGTH_EXPRESSION = /^Content-Length$/i,
  DATE_EXPRESSION = /^Date$/i,
  EXPECT_EXPRESSION = /^Expect$/i,
  TRAILER_EXPRESSION = /^Trailer$/i;

function storeHeader(self, state, field, value) {
  if (value == null)
    return;
    
  value = escapeHeaderValue(value);
  state.messageHeader += field + ': ' + value + CRLF;

  if (CONNECTION_EXPRESSION.test(field)) {
    state.sentConnectionHeader = true;
    if (CLOSE_EXPRESSION.test(value)) {
      self._last = true;
    } else {
      self.shouldKeepAlive = true;
    }
  } else if (TRANSFERCODING_EXPRESSION.test(field)) {
    state.sentTransferEncodingHeader = true;
    if (CHUNK_EXPRESSION.test(value)) 
    self.chunkedEncoding = true;
  } else if (CONTENTLENGTH_EXPRESSION.test(field)) {
    state.sentContentLengthHeader = true;
  } else if (DATE_EXPRESSION.test(field)) {
    state.sentDateHeader = true;
  } else if (EXPECT_EXPRESSION.test(field)) {
    state.sentExpect = true;
  } else if (TRAILER_EXPRESSION.test(field)) {
    state.sentTrailer = true;
  }
}

OutgoingHTTPMessageStream.prototype.write = function(chunk, encoding, callback) {
  if (this.finished) {
    var err = new Error('write after end');
    process.nextTick(writeAfterEndNT, this, err, callback);

    return true;
  }

  if (!this._header) {
    this.writeHead();
  }

  if (!this._hasBody) {
     return true;
  }

  if (typeof chunk !== 'string' && !(chunk instanceof Buffer)) {
    throw new TypeError('first argument must be a string or Buffer');
  }

  // If we get an empty string or buffer, then just do nothing, and
  // signal the user to keep writing.
  if (chunk.length === 0) return true;

  var len, ret;
  if (this.chunkedEncoding) {
    if (typeof chunk === 'string' &&
        encoding !== 'hex' &&
        encoding !== 'base64' &&
        encoding !== 'binary') {
      len = Buffer.byteLength(chunk, encoding);
      chunk = len.toString(16) + CRLF + chunk + CRLF;
      ret = this._send(chunk, encoding, callback);
    } else {
      // buffer, or a non-toString-friendly encoding
      if (typeof chunk === 'string')
        len = Buffer.byteLength(chunk, encoding);
      else
        len = chunk.length;

      if (this.context[SERVER.RawStream] && !this.context[SERVER.RawStream].corked) {
        this.context[SERVER.RawStream].cork();
        process.nextTick(streamUncorkNT, this.context[SERVER.RawStream]);
      }
      this._send(len.toString(16), 'binary', null);
      this._send(CRLF_BUF, null, null);
      this._send(chunk, encoding, null);
      ret = this._send(CRLF_BUF, null, callback);
    }
  } else {
    ret = this._send(chunk, encoding, callback);
  }

  return ret;
};

function writeAfterEndNT(self, err, callback) {
  self.emit('error', err);
  if (callback) callback(err);
}

function streamUncorkNT(rawStream) {
  if (rawStream)
    rawStream.uncork();
}

// This abstraction either writes directly to the raw transport stream or buffering it.
// Both headers and first chunk must be sent together
OutgoingHTTPMessageStream.prototype._send = function (data, encoding, callback) {
  if (!this._headerSent) {
    if (typeof data === 'string' &&
      encoding !== 'hex' &&
      encoding !== 'base64') {
      data = this._header + data;
    } else {
      this.output.unshift(this._header);
      this.outputEncodings.unshift('binary');
      this.outputCallbacks.unshift(null);
    }
    this._headerSent = true;
  }
  return this._writeRaw(data, encoding, callback);
};

OutgoingHTTPMessageStream.prototype._writeRaw = function(data, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (data.length === 0) {
    if (typeof callback === 'function')
      process.nextTick(callback);
    return true;
  }

   if ( !this.context[IOPA.CancelToken].isCancelled ) {
     return this.context[SERVER.RawStream].write(data, encoding, callback);
  } else 
     return false;
};

function escapeHeaderValue(value) {
  // Protect against response splitting. The regex test is there to
  // minimize the performance impact in the common case.
  return /[\r\n]/.test(value) ? value.replace(/[\r\n]+[ \t]*/g, '') : value;
}

OutgoingHTTPMessageStream.prototype.end = function(data, encoding, callback) {
  if (typeof data === 'function') {
    callback = data;
    data = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (data && typeof data !== 'string' && !(data instanceof Buffer)) {
    throw new TypeError('first argument must be a string or Buffer');
  }

  if (this.finished) {
    return false;
  }

  var self = this;
  function finish() {
    self.emit('finish');
  }

  if (typeof callback === 'function')
    this.once('finish', callback);

  if (!this._header) {
    if (data) {
      if (typeof data === 'string')
        this._contentLength = Buffer.byteLength(data, encoding);
      else
        this._contentLength = data.length;
    } else {
      this._contentLength = 0;
    }
    this.writeHead();
  }

  if (data && !this._hasBody) {
    data = null;
  }

  if (this.connection && data)
    this.connection.cork();

  var ret;
  if (data) {
    // Normal body write.
    ret = this.write(data, encoding);
  }

  if (this._hasBody && this.chunkedEncoding) {
    ret = this._send('0\r\n' + this._trailer + '\r\n', 'binary', finish);
  } else {
    // Force a flush
    ret = this._send('', 'binary', finish);
  }

  if (this.connection && data)
    this.connection.uncork();

  this.finished = true;

  // There is the first message on the outgoing queue, and we've sent
  // everything to the socket.
   if (this.output.length === 0 &&
      this.connection &&
      this.connection._httpMessage === this) {
    this._finish();
  }

  return ret;
};

OutgoingHTTPMessageStream.prototype._finish = function() {

  this.emit('prefinish');
};

OutgoingHTTPMessageStream.prototype._flush = function() {
  var socket = this.context[SERVER.RawStream];
  var outputLength, ret;

  if (socket && socket.writable) {
    // There might be remaining data in this.output; write it out
    outputLength = this.output.length;
    if (outputLength > 0) {
      var output = this.output;
      var outputEncodings = this.outputEncodings;
      var outputCallbacks = this.outputCallbacks;
      for (var i = 0; i < outputLength; i++) {
        ret = socket.write(output[i], outputEncodings[i],
                           outputCallbacks[i]);
      }

      this.output = [];
      this.outputEncodings = [];
      this.outputCallbacks = [];
    }

    if (this.finished) {
      // This is a queue to the server or client to bring in the next this.
      this._finish();
    } else if (ret) {
      // This is necessary to prevent https from breaking
      this.emit('drain');
    }
  }
};


OutgoingHTTPMessageStream.prototype.flushHeaders = function() {
  if (!this._header) {
    this.writeHead();
  }

  this._send('');
};
