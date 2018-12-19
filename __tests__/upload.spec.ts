import { NiftyUploader } from '../src/NiftyUploader';
import { createMockXHR } from './mocks/mockXHR';

test('chunk upload should succeed', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader();
    const file = new File(["content"], "filename");

    uploader.onChunkSuccess((data) => {
        expect(data.chunk.file.name).toBe(file.name);
        done();
    });

    uploader.addFile(file);
    
});

test('chunk upload should fail', (done) => {

    const mockXHR = createMockXHR(500);
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader();
    const file = new File(["content"], "filename");

    uploader.onChunkFail((data) => {
        expect(data.chunk.file.name).toBe(file.name);
        done();
    });

    uploader.addFile(file);
    
});

test('file upload without chunking should succeed', (done) => {

    const mockXHR = createMockXHR();
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunking: false
    });
    const file = new File(["content"], "filename");

    uploader.onFileSuccess((data) => {
        expect(data.file.name).toBe(file.name);
        done();
    });

    uploader.addFile(file);
    
});

test('file upload without chunking should fail', (done) => {

    const mockXHR = createMockXHR(500);
    (<any>window).XMLHttpRequest = jest.fn(() => mockXHR);

    // new uploader instance
    const uploader = new NiftyUploader({
        chunking: false
    });
    const file = new File(["content"], "filename");

    uploader.onFileFail((data) => {
        expect(data.file.name).toBe(file.name);
        done();
    });

    uploader.addFile(file);
    
});