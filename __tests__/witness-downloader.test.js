/**
 * Tests for the witness downloader functions
 */
const mockCore = require('./helpers/mockCore');
const mockFs = require('./helpers/mockFs');
const path = require('path');

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('fs', () => mockFs);

// Mock the tool-cache module
const mockDownloadTool = jest.fn();
const mockExtractTar = jest.fn();
const mockCacheFile = jest.fn();
const mockFind = jest.fn();

jest.mock('@actions/tool-cache', () => ({
  downloadTool: mockDownloadTool,
  extractTar: mockExtractTar,
  cacheFile: mockCacheFile,
  find: mockFind
}));

// Import the function to test
const { downloadAndSetupWitness } = require('../src/core/witnessDownloader');

describe('downloadAndSetupWitness', () => {
  // Store original platform value
  const originalPlatform = process.platform;
  
  beforeEach(() => {
    // Reset mocks
    mockCore.resetAllMocks();
    mockFs.existsSync.mockReset();
    mockFs.mkdirSync.mockReset();
    mockFs.chmodSync.mockReset();
    mockDownloadTool.mockReset();
    mockExtractTar.mockReset();
    mockCacheFile.mockReset();
    mockFind.mockReset();
    
    // Set up global console spy
    global.console.log = jest.fn();
  });
  
  afterAll(() => {
    // Restore original platform value if modified in tests
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
  });
  
  test('should return cached witness if found', async () => {
    // Set up mock inputs
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache hit
    const cachedDir = '/cached/witness/0.8.1';
    mockFind.mockReturnValue(cachedDir);
    
    // Execute
    const result = await downloadAndSetupWitness();
    
    // Verify
    expect(mockFind).toHaveBeenCalledWith('witness', '0.8.1');
    expect(result).toBe(path.join(cachedDir, 'witness'));
    expect(mockCore.addPath).toHaveBeenCalledWith(cachedDir);
    
    // Should not download if cached
    expect(mockDownloadTool).not.toHaveBeenCalled();
  });
  
  test('should download and set up witness for Linux', async () => {
    // Mock platform to Linux
    Object.defineProperty(process, 'platform', {
      value: 'linux'
    });
    
    // Set up mock inputs
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache miss and download success
    mockFind.mockReturnValue('');
    mockDownloadTool.mockResolvedValue('/tmp/downloaded-witness.tar.gz');
    
    // Mock temp directory creation
    mockFs.mkdirSync.mockImplementation(() => {});
    
    // Mock required fs.promises.rm for cleanup
    mockFs.promises = {
      rm: jest.fn().mockResolvedValue()
    };
    
    mockExtractTar.mockResolvedValue('/tmp/extracted-witness');
    mockCacheFile.mockResolvedValue('/tool-cache/witness/0.8.1/x64');
    
    // Execute
    const result = await downloadAndSetupWitness();
    
    // Verify downloads
    expect(mockFind).toHaveBeenCalledWith('witness', '0.8.1');
    expect(mockDownloadTool).toHaveBeenCalledWith(
      'https://github.com/in-toto/witness/releases/download/v0.8.1/witness_0.8.1_linux_amd64.tar.gz'
    );
    
    // Verify temp directory creation and extraction
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    expect(mockExtractTar).toHaveBeenCalledWith('/tmp/downloaded-witness.tar.gz', expect.any(String));
    
    // Verify chmod and caching
    const expectedExePath = path.join('/tmp/extracted-witness', 'witness');
    expect(mockFs.chmodSync).toHaveBeenCalledWith(expectedExePath, '755');
    expect(mockCacheFile).toHaveBeenCalledWith(expectedExePath, 'witness', 'witness', '0.8.1');
    
    // Verify PATH update
    expect(mockCore.addPath).toHaveBeenCalledWith(path.dirname('/tool-cache/witness/0.8.1/x64'));
    
    // Verify cleanup attempt
    expect(mockFs.promises.rm).toHaveBeenCalled();
    
    // Verify result is the full path
    expect(result).toBe(path.join('/tool-cache/witness/0.8.1/x64', 'witness'));
  });
  
  test('should download and set up witness for macOS', async () => {
    // Mock platform to macOS
    Object.defineProperty(process, 'platform', {
      value: 'darwin'
    });
    
    // Set up mock inputs
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache miss and download success
    mockFind.mockReturnValue('');
    mockDownloadTool.mockResolvedValue('/tmp/downloaded-witness.tar.gz');
    mockExtractTar.mockResolvedValue('/tmp/extracted-witness');
    mockCacheFile.mockResolvedValue('/tool-cache/witness/0.8.1/x64');
    
      // Mock temp directory creation
    mockFs.mkdirSync.mockImplementation(() => {});
    
    // Mock required fs.promises.rm for cleanup
    mockFs.promises = {
      rm: jest.fn().mockResolvedValue()
    };
    
    // Execute
    const result = await downloadAndSetupWitness();
    
    // Verify downloads for macOS
    expect(mockDownloadTool).toHaveBeenCalledWith(
      'https://github.com/in-toto/witness/releases/download/v0.8.1/witness_0.8.1_darwin_amd64.tar.gz'
    );
    
    // Verify temp directory is created
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    
    // Verify result
    expect(result).toBe(path.join('/tool-cache/witness/0.8.1/x64', 'witness'));
  });
  
  test('should download and set up witness for Windows', async () => {
    // Mock platform to Windows
    Object.defineProperty(process, 'platform', {
      value: 'win32'
    });
    
    // Set up mock inputs with default install dir
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache miss and download success
    mockFind.mockReturnValue('');
    mockDownloadTool.mockResolvedValue('/tmp/downloaded-witness.tar.gz');
    mockExtractTar.mockResolvedValue('/tmp/extracted-witness');
    mockCacheFile.mockResolvedValue('/tool-cache/witness/0.8.1/x64');
    
    // Mock temp directory creation
    mockFs.mkdirSync.mockImplementation(() => {});
    
    // Mock required fs.promises.rm for cleanup
    mockFs.promises = {
      rm: jest.fn().mockResolvedValue()
    };
    
    // Execute
    const result = await downloadAndSetupWitness();
    
    // Verify downloads for Windows
    expect(mockDownloadTool).toHaveBeenCalledWith(
      'https://github.com/in-toto/witness/releases/download/v0.8.1/witness_0.8.1_windows_amd64.tar.gz'
    );
    
    // Verify temp directory is created
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    
    // Verify cleanup attempt
    expect(mockFs.promises.rm).toHaveBeenCalled();
    
    // Verify result
    expect(result).toBe(path.join('/tool-cache/witness/0.8.1/x64', 'witness'));
  });
  
  test('should handle cached path without executable name', async () => {
    // Set up mock inputs
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache miss and download success
    mockFind.mockReturnValue('');
    mockDownloadTool.mockResolvedValue('/tmp/downloaded-witness.tar.gz');
    mockExtractTar.mockResolvedValue('/tmp/extracted-witness');
    
    // Mock temp directory creation
    mockFs.mkdirSync.mockImplementation(() => {});
    
    // Mock required fs.promises.rm for cleanup
    mockFs.promises = {
      rm: jest.fn().mockResolvedValue()
    };
    
    // Return a directory path without the binary name
    mockCacheFile.mockResolvedValue('/tool-cache/witness/0.8.1');
    
    // Execute
    const result = await downloadAndSetupWitness();
    
    // Verify correction of path
    expect(result).toBe('/tool-cache/witness/0.8.1/witness');
  });
  
  test('should handle chmod error gracefully', async () => {
    // Set up mock inputs
    mockCore.setInputs({
      'witness_version': '0.8.1'
    });
    
    // Mock cache miss and download success
    mockFind.mockReturnValue('');
    mockDownloadTool.mockResolvedValue('/tmp/downloaded-witness.tar.gz');
    mockExtractTar.mockResolvedValue('/tmp/extracted-witness');
    mockCacheFile.mockResolvedValue('/tool-cache/witness/0.8.1/x64');
    
    // Mock temp directory creation
    mockFs.mkdirSync.mockImplementation(() => {});
    
    // Mock required fs.promises.rm for cleanup
    mockFs.promises = {
      rm: jest.fn().mockResolvedValue()
    };
    
    // Mock chmod failure
    mockFs.chmodSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    
    // Execute
    await downloadAndSetupWitness();
    
    // Verify warning was logged but execution continued
    expect(mockCore.warning).toHaveBeenCalledWith('⚠️ Failed to make Witness executable: Permission denied');
    
    // Verify caching still happened
    expect(mockCacheFile).toHaveBeenCalled();
  });
});