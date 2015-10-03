/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 * Portions Copyright Node.js contributors. 
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
 * IOPA OutgoingHTTPMessageStream converts outbound IOPA requests and outbound responses into HTTP messages
 */

// DECLARATIONS

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

/**
 * utcDate helper method to cache date writes
 *
 * @method utcDate
 * @returns current date in UTC format, to nearest second from cache
 * @public
 */
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


/**
 * IOPA OutgoingHTTPMessageStream converts outbound IOPA requests and outbound responses into HTTP messages
 * Buffers messages to only be writing a single request/response at a time for a given parent ChannelContext (for HTTP pipelining)
 *
 * @class OutgoingHTTPMessageStream
 * @inherits Stream (standard Node Stream)
 * @param context the IOPA Context which is to be written in HTTP Format to its parentContext's [SERVER.RawStream]
 * @constructor
 * @public
 */
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
  this.sendDate = true;
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

// PUBLIC METHODS

/**
 * OutgoingHTTPMessageStream writeContinue: write "HTTP/1.1 100 Continue" line
 *
 * @method writeContinue
 * @param cb callback
 * @public
 */
OutgoingHTTPMessageStream.prototype.writeContinue = function(cb) {
  this._writeRaw('HTTP/1.1 100 Continue' + CRLF + CRLF, 'ascii', cb);
  this._sent100 = true;
};

/**
 * OutgoingHTTPMessageStream writeHead: queue the headers explicitly to the stream; usually not required publicly as called implicitly when needed
 * Note: headers may not actually be written as they wait to be attached to the first body chunk;  use flushHeaders to force a write
 *
 * @method writeHead
 * @param cb callback
 * @public
 */
OutgoingHTTPMessageStream.prototype.writeHead = function() {
  this.emit("start");
  
   if (this.context[SERVER.IsRequest])
     this._writeHeadRequest()
   else
      this._writeHeadResponse()
  
};

/**
 * OutgoingHTTPMessageStream flushHeaders: write the headers explicitly to the stream with a zero length body chunk if needed to force the write
 *
 * @method writeHead
 * @param cb callback
 * @public
 */
OutgoingHTTPMessageStream.prototype.flushHeaders = function() {
  if (!this._header) {
    this.writeHead();
  }

  this._send('');
};

/**
 * OutgoingHTTPMessageStream write: write a body chunk to the stream; fulfills the standard Node stream write method
 *
 * @method write
 * @param chunk   the chunk to write, must be a string or buffer
 * @param encoding   the encoding to use if chunk is a string
 * @param callback   optional callback
 * @overrides
 * @public
 */
OutgoingHTTPMessageStream.prototype.write = function(chunk, encoding, callback) {
  if (this.finished) {
    var err = new Error('write after end');
    process.nextTick(_writeAfterEndNT, this, err, callback);

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
        process.nextTick(_streamUncorkNT, this.context[SERVER.RawStream]);
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

/**
 * OutgoingHTTPMessageStream end: write the last body chunk to the stream and signal it is complete; fulfills the standard Node stream end method
 *
 * @method end
 * @param data   the chunk to write, must be a string or buffer (optional)
 * @param encoding   the encoding to use if data is a string
 * @param callback   optional callback
 * @overrides
 * @public
 */
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

// PRIVATE METHODS

function _writeAfterEndNT(self, err, callback) {
  self.emit('error', err);
  if (callback) callback(err);
}

function _streamUncorkNT(rawStream) {
  if (rawStream)
    rawStream.uncork();
}

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
        _storeHeader(this, state, field, value[j]);
      }
    } else {
      _storeHeader(this, state, field, value);
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


const CHUNK_EXPRESSION = /chunk/i,
  CONTINUE_EXPRESSION = /100-continue/i,
  CONNECTION_EXPRESSION = /^Connection$/i,
  TRANSFERCODING_EXPRESSION = /^Transfer-Encoding$/i,
  CLOSE_EXPRESSION = /close/i,
  CONTENTLENGTH_EXPRESSION = /^Content-Length$/i,
  DATE_EXPRESSION = /^Date$/i,
  EXPECT_EXPRESSION = /^Expect$/i,
  TRAILER_EXPRESSION = /^Trailer$/i;
function _storeHeader(self, state, field, value) {
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

 
 // MODULE EXPORTS

module.exports.OutgoingHTTPMessageStream = OutgoingHTTPMessageStream;