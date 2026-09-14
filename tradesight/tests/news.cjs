'use strict';
/* Offline unit tests for the pure parts of news.js — the RSS parser, the
   company-name cleaner and headline de-duplication. The Google News / curated
   feeds and the Claude API scoring are network-bound and not covered here. */
const assert = require('node:assert/strict');
const { parseRss, cleanName, dedupe } = require('../news');

const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item>
    <title><![CDATA[Reliance Industries Q2 profit rises 12% - Economic Times]]></title>
    <link>https://news.google.com/rss/articles/abc</link>
    <pubDate>Mon, 01 Sep 2025 08:00:00 GMT</pubDate>
    <description>&lt;p&gt;RIL beat estimates on refining margins&lt;/p&gt;</description>
    <source url="https://economictimes.indiatimes.com">Economic Times</source>
  </item>
  <item>
    <title>Market falls on global cues &amp; FII selling</title>
    <link>https://example.com/2</link>
    <pubDate>Tue, 02 Sep 2025 09:30:00 GMT</pubDate>
    <description>Sensex down 400 points</description>
  </item>
  <item>
    <title>Reliance Industries Q2 profit rises 12% - Economic Times</title>
    <link>https://example.com/dup</link>
  </item>
</channel></rss>`;

const items = parseRss(xml, 'Fallback Feed');
assert.equal(items.length, 3, 'parses every <item>');
assert.equal(items[0].title, 'Reliance Industries Q2 profit rises 12% - Economic Times', 'CDATA title unwrapped');
assert.equal(items[0].source, 'Economic Times', 'nested <source> preferred');
assert.equal(items[0].link, 'https://news.google.com/rss/articles/abc');
assert.equal(items[0].description, 'RIL beat estimates on refining margins', 'HTML stripped from description');
assert.equal(items[1].title, 'Market falls on global cues & FII selling', 'entities decoded');
assert.equal(items[1].source, 'Fallback Feed', 'falls back to the feed name when <source> is absent');

assert.equal(dedupe(items).length, 2, 'identical titles collapse');

assert.equal(cleanName('Reliance Industries Ltd'), 'Reliance');
assert.equal(cleanName('HDFC Bank Limited'), 'HDFC Bank');
assert.equal(cleanName('Tata Consultancy Services'), 'Tata Consultancy Services');
assert.equal(cleanName('Bajaj Finance Ltd - EQ'), 'Bajaj Finance');

assert.deepEqual(parseRss('', 'x'), [], 'empty input is safe');
assert.deepEqual(parseRss('<rss><channel></channel></rss>', 'x'), [], 'no items is safe');

console.log('News tests passed: RSS parse (CDATA, entities, nested source, fallback), dedupe, name cleaning, empty-input safety.');
