import fs from 'fs';

// 工具函数：保存文件流
export function pumpStreamToFile(stream, filepath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filepath)
    stream.pipe(writeStream)
    stream.on('end', resolve)
    stream.on('error', reject)
  })
}