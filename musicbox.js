async function loadBuffer(ctx, path) {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

function createBufferSource(ctx, buffer) {
    let source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.compressor);
    return source;
}

class Piano {
    constructor(notes) {
        // load 3 octaves of the given notes
        this.notes = crossProduct(notes, '345');
        this.lowOctave = 'qwertyu';
        this.midOctave = 'asdfghj';
        this.highOctave = 'zxcvbnm';
    }

    async init(ctx) {
        this.ff = await this.loadNotes(ctx, 'ff', this.notes);
        this.mf = await this.loadNotes(ctx, 'mf', this.notes);
    }

    async loadNotes(ctx, volume, notes) {
        return await Promise.all(notes.map(async (note) => {
            const path = `samples/piano/${volume}/${note}.mp3`;
            const buffer = await loadBuffer(ctx, path);
            return createBufferSource(ctx, buffer);
        }));
    }

    parseLine(line) {
        return Array.from(line).map(letter => this.getNote(letter));
    }

    getNote(letter) {
        const isCaps = (letter === letter.toUpperCase());
        const notes = isCaps ? this.ff : this.mf;
        const idx = this.letterToIndex(letter);
        return idx === null ? null : notes[idx];
    }

    letterToIndex(letter) {
        letter = letter.toLowerCase();
        if (this.lowOctave.includes(letter)) {
            return 0 + this.lowOctave.indexOf(letter);
        } else if (this.midOctave.includes(letter)) {
            return 7 + this.midOctave.indexOf(letter);
        } else if (this.highOctave.includes(letter)) {
            return 14 + this.highOctave.indexOf(letter);
        }
        return null;
    }
}

class Beats {
    cosntructor() {
    }

    async init(ctx) {
        this.alphabet = 'abcdefghijklmnopqrstuvwxyz';
        this.beats = await loadBeats(ctx, this.alphabet);
    }

    parseLine(line) {
        return Array.from(line).map(letter => this.getBeat(letter));
    }

    getBeat(letter) {
        const idx = this.alphabet.indexOf(letter.toLowerCase());
        return idx >= 0 ? this.beats[idx] : null;
    }
}

class Sequencer {
    constructor(instrument) {
        this.instrument = instrument;
        this.sequences = [];
        this.idx = 0;
    }

    length() {
        return this.sequences.map(a => a.length)
            .reduce((a, b) => Math.max(a, b), 0);
    }

    step() {
        const length = this.length();
        if (length === 0) {
            return;
        }

        if (this.idx >= length) {
            this.idx = 0;
        }

        this.sequences.map(a => a[this.idx])
            .filter(maybeBuf => !!maybeBuf)
            .forEach(buf => createBufferSource(buf.context, buf.buffer).start());
        this.idx++;
    }

    update(input) {
        this.sequences = input.split('\n')
            .map(line => this.instrument.parseLine(line));
    }
}

async function loadBeats(ctx, letters) {
    const beats = Array.from(letters);
    return await Promise.all(beats.map(async (beat) => {
        const buffer = await loadBuffer(ctx, `samples/beats/${beat}.mp3`);
        return createBufferSource(ctx, buffer);
    }));
}

function setupSequencer(instrument, name) {
    const sequencer = new Sequencer(instrument);
    const textbox = document.getElementById(name);
    sequencer.update(textbox.value);
    textbox.addEventListener('input', e => {
        sequencer.update(e.target.value);
        setHash();
    });
    return sequencer;
}

function setHash() {
    const state = JSON.stringify({
        piano: document.getElementById('piano').value,
        beats: document.getElementById('beats').value,
    });
    window.location.hash = btoa(state);
}

function loadHash() {
    if (window.location.hash.length > 0) {
        const base64 = window.location.hash.slice(1);
        try {
            const json = JSON.parse(atob(base64));
            document.getElementById('piano').value = json.piano;
            document.getElementById('beats').value = json.beats;
        } catch(e) {
            console.log(`invalid sequence ${base64}: ${e}`);
        }
    }
}

function crossProduct(a, b) {
    return Array.from(b).flatMap(a_i => Array.from(a).map(b_i => b_i + a_i));
}

window.addEventListener('load', async () => {
    loadHash();
    const ctx = new AudioContext();
    const compressor = new DynamicsCompressorNode(ctx, {
        threshold: -50,
        knee: 40,
        ratio: 12,
        attack: 0,
        release: 0.25,
    });
    compressor.connect(ctx.destination);
    ctx.compressor = compressor;
    const piano = new Piano('CDEFGAB');
    const beats = new Beats();
    await piano.init(ctx);
    await beats.init(ctx);
    document.getElementById('play').innerText = 'play/pause';
    const pianoSequencer = setupSequencer(piano, 'piano');
    const beatsSequencer = setupSequencer(beats, 'beats');

    let stopped = true;

    document.getElementById('play').addEventListener('click', () => {
        stopped = !stopped;
    });

    const bpm = 240;
    const msPerBeat = (1 / bpm) * 60 * 1000;
    setInterval(() => {
        if (!stopped) {
            pianoSequencer.step();
            beatsSequencer.step();
        }
    }, msPerBeat);
});
