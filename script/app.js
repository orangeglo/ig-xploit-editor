/*
  EverDrive GB Theme Editor
*/

class FileSeeker {
  constructor(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.position = 0;
  }

  seek(address) {
    this.position = address;
  }

  peek(bytes) {
    let data = [];
    for (let i = 0; i < bytes; i++) {
      data.push(this.peekByte(this.position + i));
    }
    return data;
  } 

  peekByte(pos) {
    if (!pos) { pos = this.position }
    return this.view.getUint8(pos);
  }

  read(bytes) {
    let data = [];
    for (let i = 0; i < bytes; i++) {
      data.push(this.readByte());
    }
    return data;
  }

  readByte() {
    let byte = this.view.getUint8(this.position);
    this.position++;
    return byte;
  }

  writeByte(byte) {
    this.view.setUint8(this.position, byte);
    this.position++;
  }

  writeBytes(bytes) {
    for (let i = 0; i < bytes.length; i++) {
      this.writeByte(bytes[i]);
    }
  }
}

const app = new Vue({
  el: '#app',
  data: {
    games: [],
    saveData: null,
    storageSaveTimeoutHandle: null
  },
  created() {
    this.loadFromStorage();
  },
  watch: {
    games: function() {
      this.triggerStorageSave();
    }
  },
  methods: {
    addGame: function() {
      this.games.push({ name: "", codes: "" })
    },
    removeGame: function(index) {
      this.games.splice(index, 1);
    },
    moveUp: function(index) {
      let game = this.games[index];
      this.games.splice(index, 1);
      this.games.splice(index - 1, 0, game);
    },
    moveDown: function(index) {
      let game = this.games[index];
      this.games.splice(index, 1);
      this.games.splice(index + 1, 0, game);
    },
    triggerStorageSave: function() {
      if (this.storageSaveTimeoutHandle) {
        clearTimeout(this.storageSaveTimeoutHandle);
      }
      this.storageSaveTimeoutHandle = setTimeout(() => {
        this.saveToStorage();
      }, 100);
    },
    taRows: function(index) {
      return this.games[index].codes.split("\n").length;
    },
    saveToStorage: function() {
      localStorage.setItem('ig_xploit_games', JSON.stringify(this.games));
    },
    loadFromStorage: function() {
      const gamesJson = localStorage.getItem('ig_xploit_games');
      if (gamesJson) {
        this.games = JSON.parse(gamesJson);
      } else {
        this.reset(false);
      }
    },
    reset: function(confirm = true) {
      let sure = true;
      if (confirm) {
        sure = window.confirm('Are you sure you want to clear your games and codes?');
      }
      if (sure) {
        this.games = [];
        this.addGame();
      }
    },
    triggerSaveFileLabel: function() { this.$refs.saveFileLabel.click(); },
    uploadSave: async function(e) {
      const fileReader = new FileReader()
      fileReader.onload = () => {
        this.parseSave(fileReader.result);
      }
      fileReader.readAsArrayBuffer(e.target.files[0]);
      e.target.value = '';
    },
    parseSave: async function(arrayBuffer) {
      const saveFile = new FileSeeker(arrayBuffer);

      offset = 0x300;
      saveFile.seek(0x300);
      zeros = 0;
      game = null;

      const pushGame = (parsedGame) => {
        if (parsedGame) {
          this.games.push({
            name: parsedGame.name,
            codes: parsedGame.codes.join("\n")
          });
        }
      };

      this.games = [];

      while (zeros < 2 && offset < 0x2000) {
        // console.log(offset);
        saveFile.seek(offset);
        const firstTwoBytes = saveFile.peek(2);
        // console.log(firstTwoBytes)
        if (firstTwoBytes[0] === 0 && firstTwoBytes[1] === 0) { // empty row
          // console.log("empty")
          zeros += 1;
          offset += 32;
        } else if (game && (firstTwoBytes[0] === 0x20 || firstTwoBytes[0] === 0)) { // cheat code title
          // console.log("inGame")
          const codeName = String.fromCharCode.apply(String, saveFile.read(19)).replace(/[^\w\s]+/g, "").trim();
          // console.log(codeName);
          offset += 28;
          saveFile.seek(offset);
          const code = saveFile.read(4).map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join("");
          // console.log(code);
          game.codes.push(`${codeName}: ${code}`);
          offset += 4;
        } else { // game title
          // console.log(game);
          pushGame(game);
          // console.log("title")
          zeros = 0;
          const title = String.fromCharCode.apply(String, saveFile.read(19)).replace(/[^\w\s]+/g, "").trim();
          game = {name: title, codes: []};
          // console.log(title);
          offset += 32;
        }
      }

      pushGame(game);
    },
    downloadSave: function() {
      const saveBuffer = new ArrayBuffer(0x2000);
      const saveFile = new FileSeeker(saveBuffer);

      offset = 0x300;
      saveFile.seek(0x300);
      this.games.forEach(game => {
        if (game.name && game.name !== "") {
          for (let i = 0; i < Math.min(game.name.length, 19); i++) {
            saveFile.writeByte(game.name.charCodeAt(i));
          }

          offset += 32
          saveFile.seek(offset);

          const codes = game.codes.split("\n");
          codes.forEach(code => {
            const splitCode = code.split(":");
            const codeTitle = splitCode[0].trim();
            // console.log(codeTitle);

            saveFile.writeByte(" ".charCodeAt(0));
            for (let i = 0; i < Math.min(codeTitle.length, 18); i++) {
              saveFile.writeByte(codeTitle.charCodeAt(i));
            }

            const codeHex = splitCode[1].toUpperCase().replace(/[^\dABCDEF]/g, '').substring(0, 8);
            // console.log(codeHex);

            const codeBytes = codeHex.match(/[\dABCDEF]{2}/g).map(byteStr => {
              return parseInt(byteStr, 16);
            });
            // console.log(codeBytes);

            saveFile.seek(offset + 28);
            saveFile.writeBytes(codeBytes);

            offset += 32
            saveFile.seek(offset);
          })

          offset += 32
          saveFile.seek(offset);
        }
      });

      const bytes = new Uint8Array(saveBuffer);
      if (this.saveData) { URL.revokeObjectURL(this.saveData) }
      this.saveData = URL.createObjectURL(new Blob([bytes]));
    }
  }
});
