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
  IOPA = iopa.constants.IOPA,
  SERVER = iopa.constants.SERVER,
  IopaTCP = require('iopa-tcp'),
  IopaHTTP = require('../index.js'),
  iopaMessageLogger = require('iopa-logger').MessageLogger,
  util = require('util'),
  EventEmitter = require('events').EventEmitter,
  should = require('should');

var numberConnections = 0;

describe('#HTTP Server()', function () {

  var server, httpClient;
  var events = new EventEmitter();

  before(function (done) {

    var app = new iopa.App();
     
    app.use(IopaTCP);
    app.use(IopaHTTP);
    app.use(iopaMessageLogger);

   
    app.use(function (context, next) {
      context.log.info("[TEST] SERVER APP USE " + context["iopa.Method"] + " " + context["iopa.Path"]);
      setTimeout(function () {
        events.emit("data", context);
      }, 40);
      return context.response["iopa.Body"].endAsync("<HTML><HEAD></HEAD><BODY>Hello World</BODY>").then(next);

    });

    server = app.createServer("tcp:");

    if (!process.env.PORT)
      process.env.PORT = 0;

    server.listen({ port: process.env.PORT, address: process.env.IP })
      .then(function () {
        done();
        setTimeout(function () { events.emit("SERVER-HTTP"); }, 50);
      });

  });

  it('should listen via TCP', function (done) {
    (server.port == null).should.equal(false);
    done();
  });


  it('should connect via TCP', function (done) {
    server.connect("http://127.0.0.1:" + server.port)
      .then(function (cl) {
        httpClient = cl;
        httpClient["server.RemotePort"].should.equal(server.port);
        done();
      });
  });

  it('should GET ', function (done) {
    httpClient.create("/projector").send()
      .then(function (response) {
        response.log.info("[TEST] /projector RESPONSE " + response["iopa.Body"].toString());
        response["iopa.StatusCode"].should.equal(200);
        var buf = response["iopa.Body"].read();
        buf.toString().should.equal('<HTML><HEAD></HEAD><BODY>Hello World</BODY>');
        done();
      });
  });

  it('should respond with state', function (done) {
    events.once("data", function (context) {
      done();
    });
  });

  it('should close', function (done) {
    server.close().then(function () {
      console.log("[TEST] Server Closed");
      done();
    });
  });

});
