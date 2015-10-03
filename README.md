# [![IOPA](http://iopa.io/iopa.png)](http://iopa.io)<br> iopa-http

[![Build Status](https://api.shippable.com/projects/560fe08d1895ca447419bd1e/badge?branchName=master)](https://app.shippable.com/projects/560fe08d1895ca447419bd1e) 
[![IOPA](https://img.shields.io/badge/iopa-middleware-99cc33.svg?style=flat-square)](http://iopa.io)
[![limerun](https://img.shields.io/badge/limerun-certified-3399cc.svg?style=flat-square)](https://nodei.co/npm/limerun/)

[![NPM](https://nodei.co/npm/iopa-http.png?downloads=true)](https://nodei.co/npm/iopa-http/)

## About
`iopa-http` is an API-First fabric for the Internet of Things (IoT) and for Microservices Container-Based Architectures (MCBA)
based on the Internet of Protocols Alliance (IOPA) specification 

It servers HTTP messages in standard IOPA format and allows existing middleware for Connect, Express and limerun projects to consume/send each mesage.

Written in native javascript for maximum performance and portability to constrained devices and services.   If you prefer to use the core Node.js 'http' transport, then
see the package [`iopa-http`](https://nodei.co/npm/iopa-connect/).

## Status

Working Release

Includes:


### Server Functions

  * HTTP/1.1 parser that matches full Node.js 'http' functions
  * Works over TCP, UDP and other IOPA transports
  * Pipelined requests and processing buffering
  * Optimized pure javascript parser with no expensive callouts to C
  * Optimized for both TCP and UDP transports with identical API 
  
### Client Functions
  * HTTP/1.1 formatter and response matcher
  * Works over TCP, UDP and other IOPA transports
  * Pipelined requests and response matching
  * Optimized for both TCP and UDP transports with identical API 
  
## Installation

    npm install iopa-http

## Usage
    
### Simple Hello World Server and Client 
``` js
const iopa = require('iopa')
  
const IopaTCP =  require('iopa-tcp'),
    IopaHTTP = require('iopa-http')
  
var app = new iopa.App();
app.use(IopaTCP);
app.use(IopaHTTP);

app.use(function (context, next) {
  context.response["iopa.Body"].end("<HTML><HEAD></HEAD><BODY>Hello World</BODY>");
  return next();
});

var server = app.createServer("tcp:");
server.listen()
  .then(function () {
      return server.connect("http://localhost:" + server["server.LocalPort"]);})
  .then(function(client) {
      return client.send("/", "GET");})
  .then(function (response) {
      response["iopa.Body"].pipe(process.stdout);
      server.close();
    });
``` 