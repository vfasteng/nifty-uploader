import { EventEmitter } from "./EventEmitter";
import { NiftyChunk } from "./NiftyChunk";
import { NiftyFile } from "./NiftyFile";
import { INiftyOptions, INiftyOptionsParameter, NiftyDefaultOptions } from "./NiftyOptions";
import { NiftyStatus } from "./NiftyStatus";
import { mergeDeep } from "./utils/deepMerge";

export class NiftyUploader {

    // files in uploader
    public files: Array<NiftyFile<any>> = new Array<NiftyFile<any>>();
    // initilize options with default options
    public options: INiftyOptions = new NiftyDefaultOptions();
    // whether the browser support html5 file system api.
    public isSupported: boolean = false;

    private ee: EventEmitter;

    constructor(options?: INiftyOptionsParameter) {
        this.ee = new EventEmitter();
        // merge provided options with current options
        this.options = mergeDeep(this.options, options);
        this.setupEventHandler();
        this.checkSupport();
    }

    /**
     * Add a File array or FileList to the uploader with optional options.
     *
     * @param files An array of File objects or a FileList, which should be added to the uploader
     * @param options Options for the files
     */
    public addFiles(files: File[] | FileList, options?: INiftyOptionsParameter): void {
        for (const file of Array.from(files)) {
            // create NiftyFile Object of File and options
            const addedFile = new NiftyFile({ uploader: this, file, options });
            // // trigger file submit event
            this.emit("file-submit", { file: addedFile });
            // // process file
            this.processFile(addedFile);
        }
    }

    /**
     * Add a File to the uploader with optional options.
     *
     * @param file The File object, which should be added to the uploader
     * @param options Options for the file
     */
    public addFile(file: File, options?: INiftyOptionsParameter): void {
        this.addFiles([file], options);
    }

    /**
     * Add initial Files to the uploader, which is already uploaded to the server.
     *
     * @param files An array of objects with the keys: name, uniqueIdentifier, size
     * @param options Options for the files
     */
    public addInitialFiles(files: Array<{ name: string, size?: number, uniqueIdentifier: string }>, options?: INiftyOptionsParameter) {
        for (const file of files) {
            // create new NiftyFile
            const initialFile = new NiftyFile({
                file: new File([], file.name),
                options,
                uploader: this,
            });
            // set status to success
            initialFile.setStatus(NiftyStatus.SUCCEEDED);
            // add the unique identifier
            initialFile.uniqueIdentifier = file.uniqueIdentifier;
            // add size if available
            initialFile.size = file.size ? file.size : 0;
            // add file to array
            this.files.push(initialFile);

            this.emit("file-success", { file: initialFile });
        }
    }

    /**
     * Add initial File to the uploader, which is already uploaded to the server.
     *
     * @param file An object with the keys: name, uniqueIdentifier, size
     * @param options Options for the file
     */
    public addInitialFile(file: { name: string, size?: number, uniqueIdentifier: string }, options?: INiftyOptionsParameter) {
        this.addInitialFiles([file], options);
    }

    /**
     * Process a NiftyFile object.
     *
     * @param file The file to process.
     */
    public processFile(file: NiftyFile) {

        const errorHandler = (errorMsg: string) => {
            // set status to rejected if processing failed
            file.setStatus(NiftyStatus.REJECTED);
            // remove from list
            file.remove();
            // trigger fileProcessingFailedEvent
            this.emit("file-rejected", { file, error: errorMsg });
        };

        try {
            file.beforeProcessing();
            if (this.options.beforeProcess) {
                this.options.beforeProcess(file);
            }
        } catch (error) {
            errorHandler(error.message);
            return;
        }

        file.setStatus(NiftyStatus.SUBMITTING);

        this.files.push(file);

        // run the process method of the file
        file.processFile().then(() => {
            // ste status to processed after successful processing
            file.setStatus(NiftyStatus.ACCEPTED);
            // trigger fileProcessedEvent
            this.emit("file-accepted", { file });
            // enqueue file if autoQueue is enabled
            if (file.options.autoQueue) {
                this.enqueueFile(file);
            }
        }).catch((errorMsg) => {
            errorHandler(errorMsg);
        });
    }

    /**
     * Enqueue file in the uploader queue.
     *
     * @param file The file to enqueue.
     */
    public enqueueFile(file: NiftyFile) {
        // set status to queued
        file.setStatus(NiftyStatus.QUEUED);
        // trigger fileQueuedEvent
        this.emit("file-queued", { file });
        // start uploading if autoUpload is enabled
        if (this.options.autoUpload) {
            this.upload();
        }
    }

    /**
     * Starts the uploading process, if a free connection is available.
     */
    public upload() {
        // get all active connections
        const activeConnections = this.activeConnectionCount();
        // calculate the free connections
        const freeConnections = this.options.numberOfConcurrentUploads - activeConnections;
        // use every free connection to upload an enqueued file
        for (let i = 0; i < freeConnections; i++) {
            this.uploadNextQueuedElement();
        }
    }

    /**
     * Starts the upload for the next enqueued file.
     */
    public uploadNextQueuedElement() {
        const filesCount = this.files.length;
        // iterate through all files
        for (let fileIndex = 0; fileIndex < filesCount; fileIndex++) {
            // get file
            const file = this.files[fileIndex];
            // check if file is queued or is uploading with chunks
            if (file.status === NiftyStatus.QUEUED ||
                (file.status === NiftyStatus.UPLOADING && file.options.chunking)) {
                // start the upload of the file
                // check if the file can be uploaded
                if (file.upload()) {
                    // exit function after first file for upload found
                    return;
                }
            }
        }
    }

    public finalize(file: NiftyFile) {

        file.setStatus(NiftyStatus.FINALIZING);

        if (this.options.finalization) {
            this.options.finalization(file).then(() => {
                file.setStatus(NiftyStatus.SUCCEEDED);
                this.ee.emit("file-success", { file });
            }).catch(() => {
                file.setStatus(NiftyStatus.FAILED);
                this.ee.emit("file-failed", { file });
            });
        } else {
            file.setStatus(NiftyStatus.SUCCEEDED);
            this.ee.emit("file-success", { file });
        }

    }

    /**
     * Cancels all files of the uploader.
     *
     * @param {boolean} remove If enabled, all files will be removed from the list of the uploader
     */
    public cancelAll(remove: boolean = true) {
        for (const file of this.files) {
            file.cancel(remove);
        }
    }

    /**
     * The percentage of the current upload progress.
     *
     * @returns {number} Percentage of the upload progress between 0 and 1
     */
    public getProgress(): number {
        let totalProgress = 0;
        let totalFiles = 0;
        for (const file of this.files) {
            // get all files, which are uploading or queued
            if (file.status === NiftyStatus.UPLOADING || file.status === NiftyStatus.QUEUED) {
                // add progress of the file to the total progress
                totalProgress += file.getProgress();
                totalFiles++;
            }
        }
        return totalProgress / totalFiles;
    }

    public getTotalFileSize(): number {
        let totalFileSize = 0;
        for (const file of this.files) {
            if (file.status !== NiftyStatus.REJECTED &&
                file.status !== NiftyStatus.FAILED_UPLOADING &&
                file.status !== NiftyStatus.CANCELED &&
                file.status !== NiftyStatus.FAILED) {
                totalFileSize += file.size;
            }
        }
        return totalFileSize;
    }

    public getFileByUniqueIdentifier<Meta>(uniqueIdentifier: string): NiftyFile<Meta> | undefined {
        for (const file of this.files) {
            if (file.uniqueIdentifier === uniqueIdentifier) {
                return file;
            }
        }
        return undefined;
    }

    public getFilesByStatus<Meta>(status: NiftyStatus[]): Array<NiftyFile<Meta>> {
        const files: Array<NiftyFile<Meta>> = new Array<NiftyFile<Meta>>();
        for (const file of this.files) {
            if (status.indexOf(file.status) > -1) {
                files.push(file);
            }
        }
        return files;
    }

    // Events
    public on(eventName: "file-submit", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-accepted", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-rejected", fn: (data: { file: NiftyFile, error: string }) => void): void;
    public on(eventName: "file-queued", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-upload-started", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-progress", fn: (data: { file: NiftyFile, progress: number }) => void): void;
    public on(eventName: "file-upload-succeeded", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-upload-failed", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-deleted", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-delete-failed", fn: (data: { file: NiftyFile, error: string }) => void): void;
    public on(eventName: "file-canceled", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-retry", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-success", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "file-failed", fn: (data: { file: NiftyFile }) => void): void;
    public on(eventName: "chunk-success", fn: (data: { chunk: NiftyChunk }) => void): void;
    public on(eventName: "chunk-failed", fn: (data: { chunk: NiftyChunk, error: string | Error }) => void): void;
    public on(eventName: "chunk-retry", fn: (data: { chunk: NiftyChunk }) => void): void;
    public on(eventName: "chunk-progress", fn: (data: { chunk: NiftyChunk, progress: number }) => void): void;
    public on(eventName: string, fn: (...args: any) => void): void {
        this.ee.on(eventName, fn);
    }

    public off(eventName: string, fn: () => void) {
        this.ee.off(eventName, fn);
    }

    public emit(eventName: "file-submit", data: { file: NiftyFile }): void;
    public emit(eventName: "file-accepted", data: { file: NiftyFile }): void;
    public emit(eventName: "file-rejected", data: { file: NiftyFile, error: string }): void;
    public emit(eventName: "file-queued", data: { file: NiftyFile }): void;
    public emit(eventName: "file-upload-started", data: { file: NiftyFile }): void;
    public emit(eventName: "file-progress", data: { file: NiftyFile, progress: number }): void;
    public emit(eventName: "file-upload-succeeded", data: { file: NiftyFile }): void;
    public emit(eventName: "file-upload-failed", data: { file: NiftyFile }): void;
    public emit(eventName: "file-deleted", data: { file: NiftyFile }): void;
    public emit(eventName: "file-delete-failed", data: { file: NiftyFile, error: string }): void;
    public emit(eventName: "file-canceled", data: { file: NiftyFile }): void;
    public emit(eventName: "file-retry", data: { file: NiftyFile }): void;
    public emit(eventName: "file-success", data: { file: NiftyFile }): void;
    public emit(eventName: "file-failed", data: { file: NiftyFile }): void;
    public emit(eventName: "chunk-success", data: { chunk: NiftyChunk }): void;
    public emit(eventName: "chunk-failed", data: { chunk: NiftyChunk, error: string | Error }): void;
    public emit(eventName: "chunk-retry", data: { chunk: NiftyChunk }): void;
    public emit(eventName: "chunk-progress", data: { chunk: NiftyChunk, progress: number }): void;
    public emit(eventName: string, data?: any) {
        this.ee.emit(eventName, data);
    }

    /**
     * The number of current active connections.
     * All files or chunks, which are uploading and using and XHR connection.
     *
     * @returns {number} Number of current active connections
     */
    private activeConnectionCount(): number {
        let numberOfConnections = 0;
        for (const file of this.files) {
            if (file.status === NiftyStatus.UPLOADING) {
                if (file.chunks.length > 0) {
                    for (const chunk of file.chunks) {
                        if (chunk.status === NiftyStatus.UPLOADING) {
                            numberOfConnections++;
                        }
                    }
                } else {
                    numberOfConnections++;
                }
            }
        }
        return numberOfConnections;
    }
    // check whether the browser support.
    // - File object type
    // - Blob object type
    // - FileList object type
    // - slicing files
    private checkSupport(): void {
        this.isSupported = (
            (typeof (File) !== "undefined")
            &&
            (typeof (Blob) !== "undefined")
            &&
            (typeof (FileList) !== "undefined")
            &&
            (!!Blob.prototype.webkitSlice || !!Blob.prototype.mozSlice || !!Blob.prototype.slice || false)
        );
    }

    private setupEventHandler() {
        this.on("chunk-success", (data: { chunk: NiftyChunk }) => {
            this.upload();
        });
        this.on("file-upload-succeeded", (data: { file: NiftyFile }) => {
            this.finalize(data.file);
            this.upload();
        });
    }

}
