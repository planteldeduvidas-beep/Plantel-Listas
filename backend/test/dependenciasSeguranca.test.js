const test = require("node:test");
const assert = require("node:assert/strict");
const proxyaddr = require("proxy-addr");
const express = require("express");
const request = require("supertest");
const { SourceMapConsumer, SourceMapGenerator } = require("source-map-js");

test("proxy corrigido nao confia em IPv4 externo por prefixo IPv6 inadequado", function () {
  for (const subnet of ["::ffff:10.0.0.0/8", "::/1"]) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust("198.51.100.20"), false);
    assert.equal(trust("::ffff:198.51.100.20"), false);
  }
  const trust = proxyaddr.compile("::ffff:10.0.0.0/104");
  assert.equal(trust("10.1.2.3"), true);
  assert.equal(trust("::ffff:10.1.2.3"), true);
  assert.equal(trust("198.51.100.20"), false);
});

test("Express preserva trust proxy de um salto e ignora IP injetado alem dele", async function () {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", function (req, res) { res.json({ ip: req.ip, ips: req.ips }); });
  const response = await request(app).get("/ip")
    .set("X-Forwarded-For", "198.51.100.10, 203.0.113.20");
  assert.equal(response.status, 200);
  assert.equal(response.body.ip, "203.0.113.20");
  assert.deepEqual(response.body.ips, ["203.0.113.20"]);
});

test("source map rejeita offset excessivo e preserva mapas validos", function () {
  const generator = new SourceMapGenerator({ file: "bundle.js" });
  generator.addMapping({ generated: { line: 1, column: 0 },
    original: { line: 2, column: 0 }, source: "original.js" });
  const map = generator.toJSON();
  const consumer = new SourceMapConsumer(map);
  assert.equal(consumer.originalPositionFor({ line: 1, column: 0 }).line, 2);
  assert.throws(function () {
    return new SourceMapConsumer({ version: 3, sections: [
      { offset: { line: 100000000, column: 0 }, map: map }
    ] });
  }, /Section offset line must not exceed/);
});
