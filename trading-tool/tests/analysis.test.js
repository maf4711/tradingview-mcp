import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChangePct,
  biasFromChange,
  interpretStudies,
  summarizeLevels,
  nearestLevels,
  overallBias,
  formatBriefText,
} from '../lib/analysis.js';

describe('parseChangePct', () => {
  it('parses percent strings', () => {
    assert.equal(parseChangePct('1.25%'), 1.25);
    assert.equal(parseChangePct('-0.5%'), -0.5);
    assert.equal(parseChangePct(2), 2);
    assert.equal(parseChangePct(null), null);
  });
});

describe('biasFromChange', () => {
  it('classifies bull/bear/neutral', () => {
    assert.equal(biasFromChange(1), 'bullish');
    assert.equal(biasFromChange(-1), 'bearish');
    assert.equal(biasFromChange(0.1), 'neutral');
    assert.equal(biasFromChange(null), 'unknown');
  });
});

describe('interpretStudies', () => {
  it('detects RSI overbought/oversold', () => {
    const { signals } = interpretStudies([
      { name: 'Relative Strength Index', values: { RSI: '72.5' } },
      { name: 'MACD', values: { MACD: '1.2', Signal: '0.8', Histogram: '0.4' } },
    ]);
    const rsi = signals.find((s) => s.indicator === 'RSI');
    assert.equal(rsi.signal, 'overbought');
    const macd = signals.find((s) => s.indicator === 'MACD');
    assert.equal(macd.signal, 'bullish_cross_bias');
  });
});

describe('summarizeLevels', () => {
  it('reads horizontal_levels and labels', () => {
    const levels = summarizeLevels(
      { studies: [{ name: 'Profiler', horizontal_levels: [100, 90, 110] }] },
      { studies: [{ name: 'Labels', labels: [{ text: 'PDH', price: 105 }] }] }
    );
    assert.ok(levels.some((l) => l.price === 110));
    assert.ok(levels.some((l) => l.text === 'PDH'));
    // sorted high → low
    assert.ok(levels[0].price >= levels[levels.length - 1].price);
  });
});

describe('nearestLevels', () => {
  it('splits support/resistance', () => {
    const levels = [
      { price: 120 },
      { price: 110 },
      { price: 100 },
      { price: 90 },
      { price: 80 },
    ];
    const n = nearestLevels(levels, 100, 2);
    assert.equal(n.resistance.length, 2);
    assert.equal(n.resistance[0].price, 110);
    assert.equal(n.support[0].price, 90);
  });
});

describe('overallBias', () => {
  it('weights price + studies', () => {
    assert.equal(overallBias(1.0, [], {}), 'bullish');
    assert.equal(
      overallBias(0, [{ signal: 'overbought' }, { signal: 'bearish_cross_bias' }], {}),
      'bearish'
    );
  });
});

describe('formatBriefText', () => {
  it('renders markdown brief', () => {
    const md = formatBriefText({
      generated_at: '2026-01-01T00:00:00.000Z',
      connection: { ok: true, symbol: 'BTCUSDT', resolution: '15' },
      current: {
        symbol: 'BTCUSDT',
        timeframe: '15',
        price: 100,
        change_pct: '1%',
        bias: 'bullish',
        signals: [],
        levels: { support: [], resistance: [] },
      },
      scan: [{ symbol: 'ETHUSDT', price: 50, change_pct: '-0.2%', bias: 'neutral' }],
    });
    assert.match(md, /Trading Brief/);
    assert.match(md, /BTCUSDT/);
    assert.match(md, /ETHUSDT/);
  });
});
