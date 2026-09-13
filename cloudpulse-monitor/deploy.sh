#!/usr/bin/env bash
set -e

# ==============================================================================
# CloudPulse 一键自动化部署脚本 (支持 Ubuntu / Debian / CentOS / Alpine)
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
SKY="\033[0;36m"
YELLOW="\033[1;33m"
RESET="\033[0m"

echo -e "${SKY}${BOLD}"
echo "  ____ _                 _ ____        _           "
echo " / ___| | ___  _   _  __| |  _ \ _   _| |___  ___  "
echo "| |   | |/ _ \| | | |/ _\` | |_) | | | | / __|/ _ \ "
echo "| |___| | (_) | |_| | (_| |  __/| |_| | \__ \  __/ "
echo " \____|_|\___/ \__,_|\__,_|_|    \__,_|_|___/\___| "
echo "   高可用监控看板 & Telegram 告警推送系统安装向导    "
echo -e "${RESET}"

# Check Docker or Node.js
if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
    echo -e "${GREEN}✓ 检测到 Docker & Docker Compose 环境${RESET}"
    echo -e "${SKY}正在通过 Docker Compose 构建并启动 CloudPulse 服务...${RESET}"
    docker compose down 2>/dev/null || true
    docker compose up -d --build
    echo -e "${GREEN}✓ CloudPulse 容器已成功在后台启动！${RESET}"
    echo -e "访问地址: ${YELLOW}http://$(curl -s ifconfig.me || echo 'localhost'):3000${RESET}"
    echo -e "默认管理密码: ${YELLOW}admin123${RESET} (请在登录后及时修改)"
    exit 0
fi

# Fallback to Node.js & PM2 direct VPS install
echo -e "${YELLOW}! 未检测到 Docker，将执行 Node.js 原生 VPS 部署流程...${RESET}"

if ! command -v node &> /dev/null; then
    echo -e "${SKY}正在安装 Node.js 20.x...${RESET}"
    if [ -f /etc/debian_version ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    fi
fi

echo -e "${GREEN}✓ Node.js 版本: $(node -v)${RESET}"

echo -e "${SKY}正在安装依赖并编译打包应用...${RESET}"
npm install
npm run build

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${SKY}正在全局安装 PM2 守护进程管理器...${RESET}"
    npm install -g pm2
fi

echo -e "${SKY}正在使用 PM2 启动 CloudPulse 守护进程...${RESET}"
pm2 delete cloudpulse 2>/dev/null || true
pm2 start dist/server.cjs --name "cloudpulse"
pm2 save

echo -e "${GREEN}${BOLD}✓ CloudPulse 部署完成！${RESET}"
echo -e "访问地址: ${YELLOW}http://$(curl -s ifconfig.me || echo 'localhost'):3000${RESET}"
echo -e "默认管理密码: ${YELLOW}admin123${RESET}"
echo -e "常用管理命令:"
echo -e "  pm2 status cloudpulse   # 查看运行状态"
echo -e "  pm2 logs cloudpulse     # 查看实时运行日志"
echo -e "  pm2 restart cloudpulse  # 重启监控服务"
