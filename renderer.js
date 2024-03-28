const { SerialPort } = require('serialport');
const { decode } = require('@msgpack/msgpack');

let port = null;
let isOpen = false;

async function openOrClosePort() {
    const selectedPortPath = document.getElementById('usbPorts').value;
    const errorDisplay = document.getElementById('error'); // Reference to the error display element
    errorDisplay.textContent = ''; // Clear any previous error messages

    if (!isOpen) {
        if (selectedPortPath) {
            initializePort(selectedPortPath); // Encapsulate port initialization logic
        } else {
            errorDisplay.textContent = 'Please select a USB port'; // Prompt user to select a port
        }
    } else {
        // Close the port if it is currently open
        if (port && port.isOpen) {
            await port.close(); // This triggers the 'close' event which resets the state
        }
    }
}

function initializePort(selectedPortPath) {
    port = new SerialPort({ path: selectedPortPath, baudRate: 115200 });
    port.on('data', handleReceivedData);
    port.on('open', () => {
        console.log('Serial port opened');
        isOpen = true;
        document.getElementById('openPortButton').textContent = 'Close';
    });
    port.on('close', () => {
        console.log('Serial port closed');
        isOpen = false;
        document.getElementById('openPortButton').textContent = 'Open';
        clearDiagnosticsDisplay(); // Clear diagnostics display
    });
}

function clearDiagnosticsDisplay() {
    const diagnosticsDiv = document.getElementById('diagnostics');
    diagnosticsDiv.innerHTML = ''; // Clears the diagnostics display area
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

// create diagnostics buffer
let diagnosticsBuffer = Buffer.alloc(0);
let diag_size = 0;

// create logs buffer
let logsBuffer = Buffer.alloc(0);

// create accumulator buffer
let accumulatedBuffer = Buffer.alloc(0);

function handleReceivedData(data) {
    console.log('Received data');
    try 
    {
        // add data to accumulated buffer
        accumulatedBuffer = Buffer.concat([accumulatedBuffer, data]);

        // find diagnostics data header "---\n"
        const startIndicator = accumulatedBuffer.indexOf("---\n");

        // if diagnostics buffer size is 
        if (diagnosticsBuffer.length > 0 && diagnosticsBuffer.length < diag_size)
        {
            // append data to diagnostics buffer
            diagnosticsBuffer = Buffer.concat([diagnosticsBuffer, accumulatedBuffer.slice(0, diag_size - diagnosticsBuffer.length)]);

            // advanced accumulatedBuffer
            accumulatedBuffer = accumulatedBuffer.slice(diag_size - diagnosticsBuffer.length);
        } 
        else if (diagnosticsBuffer.length === 0 && startIndicator !== -1)
        {
            // append data to logs buffer
            logsBuffer = Buffer.concat([logsBuffer, accumulatedBuffer.slice(0, startIndicator)]);

            try
            {
                // Convert buffer to string
                let logsString = logsBuffer.toString();

                // Split string by newline '\n'
                let logsArray = logsString.split('\n'); 

                // updatw logs window   
                appendToLogsWindow(logsArray.join('\n'));
                
                // is there a remaining data in logsBuffer
                if (logsArray[logsArray.length - 1] !== '')
                {
                    // append remaining data to accumulatedBuffer
                    accumulatedBuffer = Buffer.concat([accumulatedBuffer, Buffer.from(logsArray[logsArray.length - 1])]);
                }
                
                // reset logs buffer
                logsBuffer = Buffer.alloc(0);

            }
            catch (error)
            {
                console.error('Error converting buffer to string:', error);
            }
            

            // advanced accumulatedBuffer past startIndicator to start of size
            accumulatedBuffer = accumulatedBuffer.slice(startIndicator+4);

            // check if size is available
            if (accumulatedBuffer.length >= 4)
            {
                // get size of diagnostics data
                diag_size = accumulatedBuffer.readUInt32LE(0);

                // advanced data past size
                accumulatedBuffer = accumulatedBuffer.slice(4);

                // append data to diagnostics buffer
                diagnosticsBuffer = Buffer.concat([diagnosticsBuffer, accumulatedBuffer.slice(0, diag_size)]);

                // advanced accumulatedBuffer
                accumulatedBuffer = accumulatedBuffer.slice(diagnosticsBuffer.length);
            }

        }
        else if (diagnosticsBuffer.length === diag_size)
        {
            // decode diagnostics buffer
            try 
            {
                const decodedData = decode(diagnosticsBuffer);
                updateDiagnosticsWindow(decodedData);
            } 
            catch (decodeError) 
            {
                console.error("Error decoding MessagePack data:", decodeError);
            }

            // reset diagnostics buffer
            diagnosticsBuffer = Buffer.alloc(0);
        }
        // if diagnostics data header found

    }
    catch (error)
    {
        console.error("Error::", error);

    }
}

        

//         accumulatedBuffer = Buffer.concat([accumulatedBuffer, data]);
//         while (accumulatedBuffer.length > 0) {
//             // if there is data that is not "---\n"
            
//             const startIndicator = accumulatedBuffer.indexOf("---\n");
//             if (startIndicator !== -1 && accumulatedBuffer.length > startIndicator + 8) {
//                 const sizeBytes = accumulatedBuffer.slice(startIndicator + 4, startIndicator + 8);
//                 const size = sizeBytes.readUInt32LE(0);
//                 // console.log('size:', size);

//                 if (accumulatedBuffer.length >= startIndicator + 8 + size) {
//                     const messagePackData = accumulatedBuffer.slice(startIndicator + 8, startIndicator + 8 + size);
//                     // console.log('messagePackData:', messagePackData.length);
//                     try {
//                         const decodedData = decode(messagePackData);
//                         updateDiagnosticsWindow(decodedData);

//                         // // Log diagnostics data received and its size to the logs window
//                         // const diagnosticsLog = `Received diagnostics data (${size} bytes)`;
//                         // appendToLogsWindow(diagnosticsLog);
                        
//                     } catch (decodeError) {
//                         console.error("Error decoding MessagePack data:", messagePackData.toString("UTF-8"));
//                         // Handle decode error, e.g., by breaking out of the loop
//                         break;
//                     }

//                     // Adjust the buffer, assuming extra data handling is needed
//                     accumulatedBuffer = accumulatedBuffer.slice(startIndicator + 8 + size);

//                     // Check for extra bytes beyond expected size
//                     if (accumulatedBuffer.length > 0 && accumulatedBuffer[0] !== expectedNextStartByte) {
//                         console.log("Warning: Extra data found. Handling it...");
//                         // Handle or log extra data scenario
//                         // E.g., reset the buffer or process the extra data as a new message
//                         accumulatedBuffer = Buffer.alloc(0); // Simplest approach: clear the buffer
//                     }
//                 } else {
//                     // Not enough data for a complete message, wait for more 
//                     break;
//                 }
//             } else {
//                 // No start indicator found or not enough data to include size info
                
//                 // Write the accumulated data to the logs window
//                 writeLogs(accumulatedBuffer);
//                 break;
//             }
//         }
//     } catch (error) {
//         console.error('Error handling received data:', error);
//         const diagnosticsDiv = document.getElementById('diagnostics');
//         diagnosticsDiv.appendChild(document.createTextNode(`Error: ${error.message}`));
//     }
// }

function writeLogs(data) {
    try {
        // Define regular expression pattern to match ANSI escape sequences
        const ansiEscape = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

        // Remove escape codes from the data
        let cleanedData = data.toString('utf-8').replace(ansiEscape, '').replace(/\x00/g, '').trim();

        if (!cleanedData.startsWith("---\n")) {
            appendToLogsWindow(cleanedData);
            return;
        }

        // Process other data as needed
        // For now, let's log the received data if it's not appended to the logs window
        console.log('Received data:', cleanedData);
    } catch (error) {
        console.error('Error processing received data:', error);
    }
}

function appendToLogsWindow(log) {
    const logsDiv = document.getElementById('logs');
    const logEntry = document.createElement('div');
    logEntry.textContent = log;
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
