import { useReducer } from "react";
import axios from 'axios';
import debounce from'debounce'
let apiUrl = 'http://localhost:8888';
// import { IpcRenderer } from "electron";
// IpcRenderer.on('folder-selected', (event, folderPath) => {
//     // Use the selected folder path in your application
//     console.log('Selected folder:', folderPath);
//   });
const sendHashesToServer = (user_id, device_id,files,  hashes) => {

console.log("SENDING HASHES.....")
console.log(user_id,device_id,hashes)
  axios.post(`http://localhost:8888/hashes`, {
    user_id: user_id,
    device_id: device_id,
    hashes: hashes,
  }).then ( (rez, err) => {
    console.log("Received ....!!!!!")
    console.log(rez)
    console.log(err)
    //message.fileList, message.device_id, message.user_id
    window.electron.ipcRenderer.sendMessage('upload-files',{fileList:files,user_id:user_id,device_id: device_id})

    }).catch(err =>
      console.log(err))
}


const clientsReducer = (state, action) => {

  switch (action.type) {
    case 'ADD_CLIENT':
      // eslint-disable-next-line no-case-declarations
      const timeStamp = Date.now();
      return {
        ...state,
        clients: [
          ...state.clients,
          { id: timeStamp, mediaFolder: null, user_id: null, started: false , logs: null},
        ],
      };
      case 'UPDATE_CLIENT_MEDIA_FOLDER_FILES':
console.log("UPDATE_CLIENT_MEDIA_FOLDER_FILES....")
console.log("PAYLOAD:")
console.log( action.payload)
       const updatedClientsFiles = state.clients.map((client) => {
          if (client.id === action.payload.device_id) {
            return { ...client, files: action.payload.files , hashes: action.payload.hashes, device_id:action.payload.device_id  };
          }
          return client;
        });
        console.log({ ...state, clients: updatedClientsFiles })



        return { ...state, clients: updatedClientsFiles };
      case 'START_CLIENT':

        console.log("start cient reucer...")
        console.log(action.payload)
      const updatedClientsID = state.clients.map((client) => {
          if (client.id === action.payload) {
            return { ...client, started: !client.started };
          }
          return client;
        });
        console.log({ ...state, clients: updatedClientsID })

        return { ...state, clients: updatedClientsID };
      case 'CHANGE_USER_ID':
        const updatedClients = state.clients.map((client) => {
          if (client.id === action.payload.id) {
            return { ...client, user_id: action.payload.value };
          }
          return client;
        });
        console.log({ ...state, clients: updatedClients })
        return { ...state, clients: updatedClients };
        case 'SELECT_FOLDER':
          console.log("SELECTED FOLDER....")
          console.log(action.payload)
          const updatedClientsFLDER = state.clients.map((client) => {
            if (client.id === action.payload.device_id) {
              return { ...client, mediaFolder: action.payload.mediaFolder };
            }
            return client;
          });
          console.log({ ...state, clients: updatedClientsFLDER })
          return { ...state, clients: updatedClientsFLDER };
    default:
      return state;
  }
};
//
const initialState = {
  clients: [{ id: Date.now(), mediaFolder: null, user_id: null , started: false}],
  clientIdWithDetailsShown:null
}
function MainScreen() {
  const [state, dispatch] = useReducer(clientsReducer, initialState);
  window.electron.ipcRenderer.on('folder-selected', (arg) => {
    // eslint-disable-next-line no-console
    dispatch({ type: 'SELECT_FOLDER', payload: arg });
    console.log(arg);
  });
  window.electron.ipcRenderer.on('folder-contents', (arg) => {
    // eslint-disable-next-line no-console
    console.log("FOLDER CONTENTS..."+Date.now())
    console.log(arg);
    dispatch({ type: 'UPDATE_CLIENT_MEDIA_FOLDER_FILES', payload: arg });
    const debouoncingFunction = throttle(sendHashesToServer, 2000);
    debouoncingFunction(
      arg.user_id,
      arg.device_id,
      arg.files,
      arg.hashes)
  });


  const style = {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column'
  };
  return (
    <div style={style}>
      <button onClick={() => {
      console.log("ADD CLIENT");
        dispatch({ type: 'ADD_CLIENT' })
        }} type="button">
        Add Dummy Client
      </button>
      <div
        style={{
          display: 'flex',
          width: '90%',
          height: '40%',
          flexWrap: 'wrap',
        }}
      >
        {state.clients.map((cl) => (
          <div key = {cl.id}
            style={{
              display: "flex",
              flexDirection: "column",
              width: '200px',
              backgroundColor: 'rgba(255,255,255,0.5)',
              margin: '5px',
              borderRadius: '10px',
              alignContent:'start',
              alignItems:"space-around"
            }}
          > { cl.user_id ? <button onClick={()=>window.electron.ipcRenderer.sendMessage('select-folder',{alreadyHavePath:cl.mediaFolder,device_id: cl.id, user_id: cl.user_id})
        }  style = {{fontSize:"0.8em", margin:"5px"}} >{cl.mediaFolder != null ? truncateString(cl.mediaFolder, 10) : "select media folder"}</button> : null }

          <input onChange={(e)=>dispatch({type:"CHANGE_USER_ID",
          payload:{id:cl.id,value:e.currentTarget.value}
        })} value = {cl.user_id ? cl.user_id : ""} title = "userId" placeholder="user id" style = {{fontSize:"1em", margin:"5px"}}/>
            {cl.user_id  && cl.mediaFolder ? <button
              style={{ fontSize: '0.8em', margin: '5px', backgroundColor:cl.started == true ? 'red' : 'green' }}
              onClick={() => {
                console.log("START CLIENT....");
                window.electron.ipcRenderer.sendMessage('folder-contents',{device_id:cl.id, mediaFolder: cl.mediaFolder})
                dispatch({ type: 'START_CLIENT', payload: cl.id })
              }
            }
            >
              {cl.started == true ? 'STOP' : 'START'}
            </button> : null }
         {cl.logs ? <button style = {{fontSize:"0.7em",  margin:"5px"}} >INFO</button> : null }
            {/* Client {cl.id} */}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MainScreen;

function truncateString(str, maxLength) {
  if (str.length > maxLength) {
    return `...${str.slice(-maxLength)}`;
  }
  return str;
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
