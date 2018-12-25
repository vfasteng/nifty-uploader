import { NiftyUploader } from '../src/NiftyUploader';
import { createMockXHR } from './mocks/mockXHR';
import { NiftyStatus } from '../src/NiftyStatus';

test('cancel upload', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunkSize: 1
    });
    const file = new File(["content"], "filename");

    uploader.onFileCanceled((data) => {
        expect(data.file.status).toBe(NiftyStatus.CANCELED);
        done();
    })

    uploader.onFileUploadStarted((data) => {
        data.file.cancel();
    });

    uploader.addFile(file);
    
});

test('cancel upload with active connection', (done) => {

    let mockXHR = createMockXHR();
    mockXHR.send = jest.fn();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunking: false
    });
    const file = new File(["content"], "filename");

    uploader.onFileCanceled((data) => {
        expect(data.file.status).toBe(NiftyStatus.CANCELED);
        done();
    })

    uploader.onFileUploadStarted((data) => {
        data.file.cancel();
    });

    uploader.addFile(file);
    
});

test('cancel completed upload', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunkSize: 1
    });
    const file = new File(["content"], "filename");

    uploader.onFileSuccess((data) => {
        data.file.cancel();
        expect(data.file.status).toBe(NiftyStatus.SUCCESSFUL);
        done();
    });

    uploader.addFile(file);
    
});

test('cancel completed chunk', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunkSize: 1
    });
    const file = new File(["content"], "filename");

    uploader.onChunkSuccess((data) => {
        data.chunk.cancel();
        expect(data.chunk.status).toBe(NiftyStatus.SUCCESSFUL);
        done();
    });

    uploader.addFile(file);
    
});

test('cancel all uploads', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunkSize: 1
    });
    const file = new File(["content"], "filename");

    uploader.onFileCanceled((data) => {
        expect(data.file.status).toBe(NiftyStatus.CANCELED);
        done();
    })

    uploader.onFileAdded((data) => {
        uploader.cancelAll();
    });

    uploader.addFile(file);
    
});