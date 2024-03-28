const { SerialPort } = require('serialport');
const { decode } = require('@msgpack/msgpack');

let port = null;
let isOpen = false;
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
                    handleReceivedData(data);
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
        console.log('ports', ports);

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

function handleReceivedData(data) {
    try {
        // Accumulate incoming data
        accumulatedBuffer = Buffer.concat([accumulatedBuffer, data]);

        let processData = true;
        while (processData && accumulatedBuffer.length > 0) {
            // Attempt to find the start indicator and ensure there's enough data to determine message size
            const startIndicator = accumulatedBuffer.indexOf("---\n");
            if (startIndicator !== -1 && accumulatedBuffer.length > startIndicator + 8) {
                // Extract size and check for complete MPack message
                const sizeBytes = accumulatedBuffer.slice(startIndicator + 4, startIndicator + 8);
                const size = sizeBytes.readUInt32LE(0);
                
                if (accumulatedBuffer.length >= startIndicator + 8 + size) {
                    // We have a complete message, proceed with extracting and decoding
                    const messagePackData = accumulatedBuffer.slice(startIndicator + 8, startIndicator + 8 + size);
                    try {
                        const decodedData = decode(messagePackData);
                        updateDiagnosticsWindow(decodedData);
                    } catch (decodeError) {
                        console.error("Error decoding MessagePack data:", decodeError);
                    }
                    
                    // Prepare buffer for next message
                    accumulatedBuffer = accumulatedBuffer.slice(startIndicator + 8 + size);
                } else {
                    // Not enough data for a complete message, wait for more data
                    processData = false;
                }
            } else {
                // No start indicator found or insufficient data to determine size
                processData = false;
            }
        }
    } catch (error) {
        console.error('Error handling received data:', error);
        const diagnosticsDiv = document.getElementById('diagnostics');
        diagnosticsDiv.appendChild(document.createTextNode(`Error: ${error.message}`));
    }
}

function updateLogsWindow(text) 
{
    const logsDiv = document.getElementById('logs');
    // Append new log data without clearing existing logs
    const logEntry = document.createElement('div');
    logEntry.textContent = text;
    logsDiv.appendChild(logEntry);
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
