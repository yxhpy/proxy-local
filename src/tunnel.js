import localtunnel from 'localtunnel';

export async function createTunnel(port) {
  try {
    const tunnel = await localtunnel({ port });
    return tunnel.url;
  } catch (error) {
    console.error('隧道创建失败:', error.message);
    throw error;
  }
}