const { SerialPort } = require('serialport');
const { decode } = require('@msgpack/msgpack');

function bytesToInt(bytearray, endian = 'little') {
    let result = 0;
    if (endian === 'little') {
        for (let i = 0; i < bytearray.length; i++) {
            result += bytearray[i] << (i * 8);
        }
    } else {
        for (let i = 0; i < bytearray.length; i++) {
            result += bytearray[i] << ((bytearray.length - i - 1) * 8);
        }
    }
    return result;
}

function printBuffer(buffer) {
    let result = '';
    for (let i = 0; i < buffer.length; i++) {
        // if the byte is a printable ASCII character, append it to the result
        if (buffer[i] >= 32 && buffer[i] <= 126) {
            result += String.fromCharCode(buffer[i]);
        } else {
            // otherwise append as a hex value
            result += `\\0x${buffer[i].toString(16).padStart(2, '0')}`;
        }
    }
    console.log(result);
}

function readLine(buffer) {
    const lineBreakIndex = buffer.indexOf(10);
    if (lineBreakIndex !== -1) {
        // Extract line from buffer and remove it
        const line = buffer.splice(0, lineBreakIndex + 1);

        return Buffer.from(line).toString();
    }
    return null;
}

function readBytes(buffer, length) {
    if (buffer.length >= length) {
        // Extract data from buffer
        const data = buffer.splice(0, length);
        return data;
    }
    return null;
}

function peekLine(buffer) {
    const lineBreakIndex = buffer.indexOf(10);
    if (lineBreakIndex !== -1) {
        // Extract line from buffer without removing it
        const line = buffer.slice(0, lineBreakIndex + 1);
        return Buffer.from(line).toString();
    }
    return null;
}

function peekBytes(buffer, length) {
    if (buffer.length >= length) {
        // Extract data from buffer without removing it
        const data = buffer.slice(0, length);
        return data;
    }
    return null;
}

class SerialHandler {
    constructor() {
        this.buffer = [];
    }

    handle(data) {
        // Accumulate received data in the internal buffer
        this.buffer.push(...data);

        // Process the received data
        this.handleReceivedData();
    }

    onDataReceived(callback) {
        this.onDataReceivedCallback = callback;
    }

    handleReceivedData(){
        
        // read line from buffer until there are no more complete lines
        while (true) {
            let line = peekLine(this.buffer);
            if (line === null) {
                break;
            }
    
            // is the line a diagnostic message start indicator?
            if (line.includes("---")) {
    
                // find start of frame size
                let startIndicatorIndex = this.buffer.indexOf(10) + 1;
                
                // peek the next 4 bytes to get the size of the message
                let sizeBytes = peekBytes(this.buffer.slice(startIndicatorIndex), 4);
                if (sizeBytes === null) {
                    break;
                }
    
                // get the size of the message
                let size = bytesToInt(sizeBytes);
    
                // try to read the message
                let message = readBytes(this.buffer.slice(startIndicatorIndex + 4), size);
                if (message === null) {
                    break;
                }
    
                // advance the buffer
                this.buffer = this.buffer.slice(8 + size);
    
                // decode the message
                try {
                    const decodedData = decode(message);
                    updateDiagnosticsWindow(decodedData);
                } catch (decodeError) {
                    console.error("Error decoding MessagePack data:", decodeError);
                }
            }
            else {
    
                // read log message
                let logMessage = readLine(this.buffer);
                if (logMessage === null) {
                    break;
                }
    
                // add a newline to the log message
                logMessage += '\n';
    
                // update the logs window
                updateLogsWindow(logMessage);
            }
        }
    }
}

let port = null;
let isOpen = false;

const serialHandler = new SerialHandler();

async function openOrClosePort() 
{
    if (!isOpen) 
    {
        const selectedPortPath = document.getElementById('usbPorts').value;
        if (selectedPortPath) 
        {
            try 
            {
                port = new SerialPort({ path: selectedPortPath, baudRate: 115200 });
                port.on('data', (data) => 
                {
                    serialHandler.handle(data);
                });
                port.on('open', () => 
                {
                    console.log('Serial port opened');
                });
                port.on('close', () => 
                {
                    console.log('Serial port closed');
                    isOpen = false;
                    document.getElementById('openPortButton').textContent = 'Open';
                });
                document.getElementById('error').textContent = ''; // Clear any previous error messages
                document.getElementById('openPortButton').textContent = 'Close'; // Change button text
                isOpen = true;

            } 
            catch (err) 
            {
                console.error('Error opening port:', err);
                document.getElementById('error').textContent = err.message;
                isOpen = false; // Ensure isOpen reflects the actual state
            }
        } 
        else 
        {
            document.getElementById('error').textContent = 'Please select a USB port';
        }
    } 
    else 
    {
        if (port && port.isOpen) 
        {
            try 
            {
                await port.close(); // This should trigger the 'close' event listener
                // The 'close' event listener will handle setting isOpen to false and updating the button text
            } 
            catch (err) 
            {
                console.error('Error closing port:', err);
                document.getElementById('error').textContent = err.message;
            }
        }
    }
}

async function listSerialPorts() 
{
    try 
    {
        const ports = await SerialPort.list();

        const usbPortsSelect = document.getElementById('usbPorts');
        usbPortsSelect.innerHTML = ''; // Clear existing options

        ports.forEach(port => 
            {
            if (port.vendorId && port.productId) // Check if it's a USB port
            { 
                const option = document.createElement('option');
                option.value = port.path;
                option.textContent = `${port.path} - ${port.manufacturer || 'Unknown Manufacturer'}`;
                usbPortsSelect.appendChild(option);
            }
        });

        if (usbPortsSelect.options.length === 0) 
        {
            document.getElementById('error').textContent = 'No USB ports discovered';
        } 
        else 
        {
            document.getElementById('error').textContent = '';
        }
    } 
    catch (err) 
    {
        console.error('Error listing serial ports:', err);
        document.getElementById('error').textContent = err.message;
    }
}

// Buffer to accumulate data
let accumulatedBuffer = Buffer.alloc(0);

// function handleReceivedData(data) {
//     try {
//         // Accumulate incoming data
//         accumulatedBuffer = Buffer.concat([accumulatedBuffer, data]);

//         let processData = true;
//         while (processData && accumulatedBuffer.length > 0) {
//             // Attempt to find the start indicator and ensure there's enough data to determine message size
//             const startIndicator = accumulatedBuffer.indexOf("---\n");
//             if (startIndicator !== -1 && accumulatedBuffer.length > startIndicator + 8) {
//                 // Extract size and check for complete MPack message
//                 const sizeBytes = accumulatedBuffer.slice(startIndicator + 4, startIndicator + 8);
//                 const size = sizeBytes.readUInt32LE(0);
                
//                 if (accumulatedBuffer.length >= startIndicator + 8 + size) {
//                     // We have a complete message, proceed with extracting and decoding
//                     const messagePackData = accumulatedBuffer.slice(startIndicator + 8, startIndicator + 8 + size);
//                     try {
//                         const decodedData = decode(messagePackData);
//                         updateDiagnosticsWindow(decodedData);
//                     } catch (decodeError) {
//                         console.error("Error decoding MessagePack data:", decodeError);
//                     }
                    
//                     // Prepare buffer for next message
//                     accumulatedBuffer = accumulatedBuffer.slice(startIndicator + 8 + size);
//                 } else {
//                     // Not enough data for a complete message, wait for more data
//                     processData = false;
//                 }
//             } else {
//                 // No start indicator found or insufficient data to determine size
//                 processData = false;
//             }
//         }
//     } catch (error) {
//         console.error('Error handling received data:', error);
//         const diagnosticsDiv = document.getElementById('diagnostics');
//         diagnosticsDiv.appendChild(document.createTextNode(`Error: ${error.message}`));
//     }
// }


function updateLogsWindow(text) 
{
    const logsDiv = document.getElementById('logs');

    // create a <div> element for the new log message
    const logDiv = document.createElement('div');

    // set the text content of the <div>
    logDiv.textContent = text + '\n';

    // append the <div> to the logs window
    logsDiv.appendChild(logDiv);

    // // Scroll to the bottom of the logs window
    // logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Round all float values in the decoded data to 3 decimal places
function roundFloatValues(obj) 
{
    for (let key in obj) 
    {
        if (typeof obj[key] === 'number')
        {
            // Round float values to 3 decimal places
            obj[key] = Number(obj[key].toFixed(3));
        } else if (typeof obj[key] === 'object' && obj[key] !== null) 
        {
            // Recursively round floats in nested objects or arrays
            roundFloatValues(obj[key]);
        }
    }
}

function updateDiagnosticsWindow(decodedData) 
{
    const diagnosticsDiv = document.getElementById('diagnostics');
    diagnosticsDiv.innerHTML = ''; // Clear the diagnostics window for simplicity

    // Round all float values in the decoded data to 3 decimal places
    roundFloatValues(decodedData);

    const jsonData = JSON.stringify(decodedData, null, 2);
    const preTag = document.createElement('pre');
    preTag.textContent = jsonData;
    diagnosticsDiv.appendChild(preTag);
}

// file system module  
const fs = require('fs');
const { log } = require('console');
const log_to_file_enabled = true;

// Log to file
function logToFile(message) {
    // open logs folder if doesnt exists create it
    if (!fs.existsSync('logs')) 
    {
        fs.mkdirSync('logs');
    }

    // logfile name is the current date
    const logFile = `logs/${new Date().toISOString().slice(0, 10)}.log`;

    // write to log file
    fs.appendFileSync(logFile, message + '\n');
}


// Initialize USB port list
listSerialPorts();

// Add event listener to open/close button
document.getElementById('openPortButton').addEventListener('click', openOrClosePort);