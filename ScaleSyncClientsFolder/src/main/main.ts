/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs';
import debounce from 'debounce'
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import FormData from 'form-data';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import * as crypto from 'crypto';
import * as moment from 'moment';
import axios from 'axios';
import mime from 'mime-types';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.on('upload-files', throttle( async (event, message) => {

  const uploadUrl = "http://localhost:8888/upload/";

uploadFiles(message.fileList.slice(0, 100),uploadUrl, message.device_id, message.user_id)
  .then(results => {
    results.forEach((result, index) => {
      if (result.success) {
        console.log(`File ${message.fileList[index].name} upload successful:`, result.response);
      } else {
        console.error(`File ${message.fileList[index].name} upload error:`, result.error);
      }
    });
  })
  .catch(error => {
    console.error('Overall upload error:', error);
  });


}, 5000));

// ipcMain.on('folder-contents', async (event, message) => {
//   const { mediaFolder } = message;
//   const { device_id } = message;

//   fs.readdir(mediaFolder, (err, files) => {
//     if (err) {
//       console.error('Error reading folder:', err);
//       return;
//     }
//     const imgFiles = files.filter(
//       (file) =>
//         path.extname(file) === '.jpg' ||
//         path.extname(file) === '.png' ||
//         path.extname(file) === '.jpeg' ||
//         path.extname(file) === '.webp' ||
//         path.extname(file) === '.bmp'
//     );
//     console.log('Image files in the folder:', imgFiles);
//     event.sender.send('folder-contents', {
//       mediaFolder,
//       device_id,
//       files: imgFiles,
//     });
//   });
// });

ipcMain.on('select-folder', async (event, message) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: message.alreadyHavePath || process.cwd(),
  });

  if (!result.canceled && result.filePaths.length > 0) {
    event.sender.send('folder-selected',{mediaFolder: result.filePaths[0], device_id:message.device_id});

    function handleWatchingChanges(result, message) {
  console.log('Folder contents changed');
  getFilesWithModificationTime(result.filePaths[0]).then ( files => {
console.log(files)
if (!message.device_id) {
console.log(message)
}
let toSend = {
mediaFolder: result.filePaths[0],
device_id: message.device_id,
user_id: message.user_id,
files: files,
hashes: createStructuredHashes(files)
}
console.log("toSend:")
console.log(toSend)
event.sender.send('folder-contents', toSend
    );
  }
  )
}

  fs.watchFile(result.filePaths[0], (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      const debouncedFunction = throttle(handleWatchingChanges, 1000);

      // Call the debounced function with arguments
      debouncedFunction(result, message);
      console.log("folder-contents from MAIN.." + Date.now())

    }
  });
}
}
);


if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);



  interface Bracket {
    month: string;
    start: number;
    end: number;
    files: string[];
  }
  function createStructuredHashes(files) {

   let highAndLow = getHighAndLowTimeStamps(files)
   let brackets = giveMeIntervals(highAndLow.min, highAndLow.max)
    // files = files.filter ( file => file.modified_at < Date.now() && file.modified_at > 1629297859 )

      // var hashes = generateCombinedHash(res.map(img => img.id))
      files.forEach(file => {
          let bracket  = brackets.filter(bracket => file.modified_at/1000 >= bracket.start && file.modified_at/1000 <= bracket.end )[0]
          bracket.files.push(file.filename)
      });
   return   brackets.filter(br => br.files.length > 0).map(bracket => { return { [bracket.month] : generateCombinedHash(bracket.files) } })

  }
  function hashesForTimePeriod(start: number, end: number, files: any[]) {
    const brackets: Bracket[] = giveMeIntervals(start, end);
    files.forEach(img => {
      const bracket = brackets.find(bracket => img.created_at >= bracket.start && img.created_at <= bracket.end);
      if (bracket) {
        bracket.files.push(img.id);
      }
    });

    const filteredBrackets = brackets.filter(bracket => bracket.files.length > 0);
    const result = filteredBrackets.map(bracket => ({
      [bracket.month]: generateCombinedHash(bracket.files)
    }));

    return result;
  }

  function generateCombinedHash(fileIDs: string[]): string {
    fileIDs = fileIDs.sort()
    const chunkSize = 100;
    const generateSHA256Hash = (data: string): string => {
      const hash = crypto.createHash('sha256');
      hash.update(data);
      return hash.digest('hex');
    };

    const chunkedHashes: string[] = [];
    for (let i = 0; i < fileIDs.length; i += chunkSize) {
      const chunk = fileIDs.slice(i, i + chunkSize).join('');
      const chunkHash = generateSHA256Hash(chunk);
      chunkedHashes.push(chunkHash);
    }

    const combinedHash = generateSHA256Hash(chunkedHashes.join(''));
    return combinedHash;
  }

  function giveMeIntervals(startTimestamp: number, endTimestamp: number): Bracket[] {
    const intervals: Bracket[] = [];
    startTimestamp = startTimestamp /1000
    endTimestamp = endTimestamp / 1000
    let currentMonth = moment.unix(startTimestamp).startOf('month');

    while (currentMonth.unix() <= endTimestamp) {
      const nextMonth = currentMonth.clone().add(1, 'month');

      intervals.push({
        month: currentMonth.format('MM-YYYY'),
        start: currentMonth.unix(),
        end: Math.min(nextMonth.unix(), endTimestamp),
        files: [],
      });

      currentMonth = nextMonth;
    }

    return intervals;
  }

   function getFilesWithModificationTime(directoryPath: string): Promise<{ filename: string, created_at: number }[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(directoryPath, (err, files) => {
        if (err) {
          reject(err);
          return;
        }

        const filesWithMODIFICATIONTime: { filename: string, modified_at: number }[] = [];

        files.forEach(file => {
          const filePath = path.join(directoryPath, file);

          fs.stat(filePath, (statErr, stats) => {
            if (statErr) {
              reject(statErr);
              return;
            }

            const modified_at = stats.mtime.getTime(); // Get creation time as a UNIX timestamp
            filesWithMODIFICATIONTime.push({ filename: file, modified_at , fullPath: filePath });

            if (filesWithMODIFICATIONTime.length === files.length) {
              resolve(filesWithMODIFICATIONTime.filter (oneFile => {
                   return  path.extname(oneFile.filename) === '.jpg' ||
                    path.extname(oneFile.filename) === '.png' ||
                    path.extname(oneFile.filename) === '.jpeg' ||
                    path.extname(oneFile.filename) === '.webp' ||
                    path.extname(oneFile.filename) === '.bmp'

              }));
            }
          });
        });
      });
    });
  }



function getHighAndLowTimeStamps(files) {
  return files.reduce(
    (acc, file) => {
      const modifiedAt = file.modified_at;

      if (modifiedAt < acc.min) {
        acc.min = modifiedAt;
      }

      if (modifiedAt > acc.max) {
        acc.max = modifiedAt;
      }

      return acc;
    },
    {
      min: Number.MAX_SAFE_INTEGER,
      max: Number.MIN_SAFE_INTEGER,
    })
}

async function uploadFiles(fileList, uploadUrl, device_id, user_id) {
  uploadUrl = "http://localhost:8888/upload"

  const uploadPromises = fileList.map(async file => {
    try {
      const  urlupl =`${uploadUrl}/${encodeURIComponent(file.filename)}/${encodeURIComponent(file.filename)}/${user_id}/${device_id}/${file.modified_at}/${file.modified_at}`
      const response = await uploadSingleFile(
        file,
        urlupl
      );
      return { success: true, response };
    } catch (error) {
      return { success: false, error };
    }
  });

  return Promise.all(uploadPromises);
}

async function uploadSingleFile(file, uploadUrl) {
  const form = new FormData();
  const stream = fs.createReadStream(file.fullPath);
  // const mimeType = mime.lookup(file.name) || 'application/octet-stream';

  form.append('file', stream);
  // const stream = fs.createReadStream(file.fullPath);
  // const mimeType = mime.lookup(file.filename) || 'application/octet-stream';
  // const blob = new Blob([stream], { type: mimeType });

  // form.append('files', blob, file.name);
  // form.append('files', fs.createReadStream(file.fullPath), {
  //   filename: file.filename,
  //   contentType: file.type,
  // });

  try {
    const response = await axios.post(uploadUrl, form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    return response.data;
  } catch (error) {
    throw error;
  }
}

function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = new Date().getTime();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}
