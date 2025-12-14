// Consolidates old samples into coverage elements and archives them.
import * as util from '../content/shared.js';

// TODO: App-token for 'auth'?

// Samples are consolidated after they are this age.
const DEF_CONSOLIDATE_AGE = 0.5;

// Only the N-newest samples are kept so that
// recent samples can eventually flip a coverage tile.
const MAX_SAMPLES_PER_COVERAGE = 15;

// Merge the new coverage data with the previous (if any).
async function mergeCoverage(key, samples, store) {
  // Get existing coverage entry (or defaults).
  const entry = await store.getWithMetadata(key, "json");
  const prevRepeaters = entry?.metadata?.hitRepeaters ?? [];
  const prevUpdated = entry?.metadata?.updated ?? 0;
  let value = entry?.value ?? [];

  // To avoid people spamming the coverage data and blowing
  // up the history, merge the batch of new samples into
  // one uber-entry per-consolidation. That way spamming
  // has to happen over N consolidations.
  const uberSample = {
    time: 0,
    heard: 0,
    lost: 0,
    lastHeard: 0,
    repeaters: [],
  };

  // Build the uber sample.
  samples.forEach(s => {
    // Was this sample handled in a previous batch?
    if (s.time <= prevUpdated)
      return;

    uberSample.time = Math.max(s.time, uberSample.time);

    if (s.path?.length > 0) {
      uberSample.heard++;
      uberSample.lastHeard = Math.max(s.time, uberSample.lastHeard);
      s.path.forEach(p => {
        if (!uberSample.repeaters.includes(p))
          uberSample.repeaters.push(p);
      });
    } else {
      uberSample.lost++;
    }
  });

  // If uberSample has invalid time, all samples must have
  // been handled previously, nothing to do.
  if (uberSample.time === 0)
    return;

  // Migrate existing values to the new format.
  value.forEach(v => {
    // An older version saved 'time' as a string. Yuck.
    v.time = Number(v.time);

    if (v.heard === undefined) {
      // Old format -- update.
      const wasHeard = v.path?.length > 0;
      v.heard = wasHeard ? 1 : 0;
      v.lost = wasHeard ? 0 : 1;
      v.lastHeard = wasHeard ? v.time : 0;
      v.repeaters = v.path;
      delete v.path;
    }
  });

  value.push(uberSample);

  // Are there too many samples?
  if (value.length > MAX_SAMPLES_PER_COVERAGE) {
    // Sort and keep the N-newest.
    value = value.toSorted((a, b) => a.time - b.time).slice(-MAX_SAMPLES_PER_COVERAGE);
  }
  
  // Compute new metadata stats, but keep the existing repeater list (for now).
  const metadata = {
    heard: 0,
    lost: 0,
    lastHeard: 0,
    updated: uberSample.time,
    hitRepeaters: []
  };
  const repeaterSet = new Set(prevRepeaters);
  value.forEach(v => {
    metadata.heard += v.heard;
    metadata.lost += v.lost;
    metadata.lastHeard = Math.max(metadata.lastHeard, v.lastHeard);
    v.repeaters.forEach(r => repeaterSet.add(r.toLowerCase()));
  });
  metadata.hitRepeaters = [...repeaterSet];

  await store.put(key, JSON.stringify(value), { metadata: metadata });
}

export async function onRequest(context) {
  const coverageStore = context.env.COVERAGE;
  const sampleStore = context.env.SAMPLES;
  const archiveStore = context.env.ARCHIVE;

  const url = new URL(context.request.url);
  let maxAge = url.searchParams.get('maxAge') ?? DEF_CONSOLIDATE_AGE; // Days
  if (maxAge <= 0)
    maxAge = DEF_CONSOLIDATE_AGE;

  const result = {
    coverage_entites_to_update: 0,
    samples_to_update: 0,
    merged_ok: 0,
    merged_fail: 0,
    archive_ok: 0,
    archive_fail: 0,
    delete_ok: 0,
    delete_fail: 0,
    delete_skip: 0
  };
  const hashToSamples = new Map();
  let cursor = null;

  // Build index of old samples.
  do {
    const samplesList = await sampleStore.list({ cursor: cursor });
    cursor = samplesList.cursor ?? null;

    // Group samples by 6-digit hash
    samplesList.keys.forEach(s => {
      // Ignore recent samples.
      if (util.ageInDays(s.metadata.time) < maxAge) return;

      result.samples_to_update++;
      const key = s.name.substring(0, 6);
      util.pushMap(hashToSamples, key, {
        key: s.name,
        time: s.metadata.time,
        path: s.metadata.path
      });
    });
  } while (cursor !== null);

  result.coverage_entites_to_update = hashToSamples.size
  const mergedKeys = [];

  // Merge old samples into coverage items.
  await Promise.all(hashToSamples.entries().map(async ([k, v]) => {
    try {
      await mergeCoverage(k, v, coverageStore);
      result.merged_ok++;
      mergedKeys.push(k);
    } catch (e) {
      console.log(`Merge failed. ${e}`);
      result.merged_fail++;
    }
  }));

  // Archive and delete the old samples.
  await Promise.all(mergedKeys.map(async k => {
    const v = hashToSamples.get(k);
    for (const sample of v) {
      try {
        await archiveStore.put(sample.key, "", {
          metadata: { time: sample.time, path: sample.path }
        });
        result.archive_ok++;
        try {
          await sampleStore.delete(sample.key);
          result.delete_ok++;
        } catch (e) {
          console.log(`Delete failed. ${e}`);
          result.delete_fail++;
        }
      } catch (e) {
        console.log(`Archive failed. ${e}`);
        result.archive_fail++;
        result.delete_skip++;
      }
    }
  }));

  return new Response(JSON.stringify(result));
}
