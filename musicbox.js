async function loadBuffer(ctx, path) {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

function createBufferSource(ctx, buffer) {
    let source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    return source;
}

class PianoSequencer {
    constructor(notes) {
        // load 3 octaves of the given notes
        this.notes = crossProduct(notes, '345');
        this.input = '';
        this.lowOctave = 'qwertyu';
        this.midOctave = 'asdfghj';
        this.highOctave = 'zxcvbnm';
    }

    async init(ctx) {
        this.ff = await loadNotes(ctx, 'ff', this.notes);
        this.mf = await loadNotes(ctx, 'mf', this.notes);
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

class BeatSequencer {
    cosntructor() {
        this.input = '';
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
    constructor(piano, beats) {
        this.piano = piano;
        this.beats = beats;
        this.pianoSequences = [];
        this.beatsSequences = [];
        this.idx = 0;
    }

    toBase64() {
        const json = JSON.stringify({
            piano: this.piano.input,
            beats: this.beats.input,
        });
        return btoa(json);
    }

    buildSequence(instrument, input) {
        instrument.input = input;
        return input.split('\n').map(line => instrument.parseLine(line));
    }

    length() {
        return this.pianoSequences.map(a => a.length)
            .concat(this.beatsSequences.map(a => a.length))
            .reduce((a, b) => Math.max(a, b), 0);
    }

    play() {
        const length = this.length();
        if (length === 0) {
            console.log('empty');
            return;
        }

        if (this.idx >= length) {
            this.idx = 0;
        }

        this.pianoSequences.map(a => a[this.idx])
            .concat(this.beatsSequences.map(a => a[this.idx]))
            .filter(maybeBuf => !!maybeBuf)
            .forEach(buf => cloneBuf(buf).start());
        this.idx++;
    }

    updatePiano(input) {
        this.pianoSequences = this.buildSequence(this.piano, input);
        console.log(this.pianoSequences);
    }

    updateBeats(input) {
        this.beatsSequences = this.buildSequence(this.beats, input);
        console.log(this.beatsSequences);
    }
}

async function loadNotes(ctx, volume, notes) {
    return await Promise.all(notes.map(async (note) => {
        const buffer = await loadBuffer(ctx, `samples/piano/${volume}/${note}.mp3`);
        return createBufferSource(ctx, buffer);
    }));
}

async function loadBeats(ctx, letters) {
    const beats = Array.from(letters);
    return await Promise.all(beats.map(async (beat) => {
        const buffer = await loadBuffer(ctx, `samples/beats/${beat}.mp3`);
        return createBufferSource(ctx, buffer);
    }));
}

function setupSequencer(piano, beats) {
    const sequencer = new Sequencer(piano, beats);
    const pianoTextbox = document.getElementById('piano');
    const beatsTextbox = document.getElementById('beats');
    if (window.location.hash.length > 0) {
        const base64 = window.location.hash.slice(1);
        try {
            const json = JSON.parse(atob(base64));
            pianoTextbox.value = json.piano;
            beatsTextbox.value = json.beats;
        } catch(e) {
            console.log(`invalid sequence ${base64}: ${e}`);
        }
    }
    sequencer.updatePiano(pianoTextbox.value);
    sequencer.updateBeats(beatsTextbox.value);
    pianoTextbox.addEventListener('input', e => {
        sequencer.updatePiano(e.target.value);
        window.location.hash = sequencer.toBase64();
    });
    beatsTextbox.addEventListener('input', e => {
        sequencer.updateBeats(e.target.value);
        window.location.hash = sequencer.toBase64();
    });
    return sequencer;
}

function cloneBuf(note) {
    return createBufferSource(note.context, note.buffer);
}

function crossProduct(a, b) {
    return Array.from(b).flatMap(a_i => Array.from(a).map(b_i => b_i + a_i));
}

window.addEventListener('load', async () => {
    const ctx = new AudioContext();
    const piano = new PianoSequencer('CDEFGAB');
    const beats = new BeatSequencer();
    console.log('loading...');
    await piano.init(ctx);
    await beats.init(ctx);
    console.log('done');
    const sequencer = setupSequencer(piano, beats);

    const bpm = 120;
    const msPerBeat = (1 / bpm) * 60 * 1000;
    setInterval(() => sequencer.play(), msPerBeat);
});
