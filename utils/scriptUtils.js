import { spawn } from 'child_process';
import { chmod, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';
export const parseHosts = (input) => {
    const regex = /(?<=(\n|^))([\w.:]*)\s*([\w- ]*)/g;
    const matches = [...input.matchAll(regex)];
    return matches.map(([, , ip, hostname]) => [ip, hostname]);
};
export const createLock = () => {
    const lock = {};
    lock.p = new Promise((res, rej) => {
        lock.res = res;
        lock.rej = rej;
    });
    return lock;
};
export const useReadLine = (stdin, stdout) => {
    const rl = createInterface({ input: stdin, output: stdout });
    const asyncReadLine = async (question) => {
        const questionLock = createLock();
        rl.question(question, questionLock.res);
        return questionLock.p;
    };
    return asyncReadLine;
};
/**
 * Wait for a process to exit or for a process to reach a flag
 */
export const asyncProcess = (command, opts) => {
    const procLock = createLock();
    const subProc = spawn(command, opts);
    const { outputNeedsToEqual, ignoreErrors } = opts;
    if (outputNeedsToEqual) {
        subProc.stdout.on('data', data => {
            const strData = data.toString();
            console.log(strData);
            if (strData.includes(outputNeedsToEqual))
                procLock.res();
        });
    }
    else {
        subProc.on('exit', procLock.res);
        subProc.stdout.on('data', data => console.log(data.toString()));
    }
    subProc.stderr.on('data', (e) => {
        const strErr = e.toString();
        console.error(strErr);
        if (ignoreErrors)
            return;
        const nonErrors = [
            'Debugger attached.\n',
            'Waiting for the debugger to disconnect...\n',
            'DeprecationWarning:',
            'Cloning',
            'warning',
        ];
        for (const nonError of nonErrors) {
            if (strErr.includes(nonError))
                return;
        }
        procLock.rej(strErr);
    });
    return [procLock.p, subProc];
};
export const createKeyFileString = (input) => {
    let result = '';
    const inputKeys = Object.keys(input);
    for (const key of inputKeys) {
        result += `export const ${key} = '${input[key]}';\n`;
    }
    return result;
};
export const setupSSLKey = async (input, keyFileLocation, keyFileName) => {
    input = input.trim();
    const type = input.startsWith('-----BEGIN CERTIFICATE-----') &&
        input.endsWith('-----END CERTIFICATE-----')
        ? 'fullchain'
        : input.startsWith('-----BEGIN PRIVATE KEY-----') &&
            input.endsWith('-----END PRIVATE KEY-----')
            ? 'privkey'
            : 'bad input';
    if (type === 'bad input')
        throw 'Bad input, not writing key. If you need ssl, please put the keys under server/cert/privkey.pem and server/cert/fullchain.pem.\n Do not forget that the folder needs to have be chmoded to 700, the privkey needs to be chmoded to 600 and the fullchain needs to be chmoded to 644 for the server to work. ';
    keyFileLocation === undefined
        ? (keyFileLocation = join(__dirname, '../server/cert/'))
        : keyFileLocation;
    keyFileName === undefined
        ? (keyFileName = type === 'fullchain' ? 'fullchain.pem' : 'privkey.pem')
        : keyFileName;
    const keyFilePath = join(keyFileLocation, keyFileName);
    const keyFilePermission = type === 'fullchain' ? 644 : 600;
    const keyFileLocationPermission = 700;
    console.log(`Writing ${keyFileName} ...`);
    await mkdir(keyFileLocation);
    await writeFile(keyFilePath, input);
    console.log(`Wrote ${keyFileName}, updating permissions of ${keyFileName}`);
    await chmod(keyFileLocation, keyFileLocationPermission);
    console.log(`Set the permissions for the cert folder to ${keyFileLocationPermission}`);
    await chmod(keyFilePath, keyFilePermission);
    console.log(`Set the permissions for the (${keyFileName}) ssl key to ${keyFilePermission}`);
};
export const yesNoQuestion = async (question, asyncReadLine, { validateFn, ignoreDefaultValidation, truthyValidators, falsyValidators } = {}) => {
    let proceed = false, userAgreed = false, userInput;
    do {
        userInput = (await asyncReadLine(question)).trim();
        if (!ignoreDefaultValidation)
            switch (userInput) {
                case 'y':
                case 'ye':
                case 'yes':
                case 'Y':
                case 'Ye':
                case 'Yes':
                    proceed = true;
                    userAgreed = true;
                    break;
                case 'n':
                case 'no':
                case 'N':
                case 'No':
                    proceed = true;
                    break;
                default:
                    break;
            }
        if (falsyValidators)
            for (const validator of falsyValidators) {
                if (userInput !== validator.trim())
                    break;
                proceed = true;
            }
        if (truthyValidators)
            for (const validator of truthyValidators) {
                if (userInput !== validator.trim())
                    break;
                proceed = true;
                userAgreed = true;
            }
        if (validateFn) {
            [proceed, userAgreed] = validateFn(userInput);
        }
    } while (!proceed);
    return [userAgreed, userInput];
};
export const escapeRegex = (input) => input.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
