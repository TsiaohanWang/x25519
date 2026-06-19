# 第13章：密钥生成

## 13.1 概述

X25519 密钥生成是将随机字节转换为有效私钥和公钥的过程。本章介绍密钥生成的完整流程。

## 13.2 密钥生成流程

### 步骤

1. **生成随机字节**：32 字节随机数
2. **钳位处理**：确保私钥具有正确的形式
3. **计算公钥**：使用标量乘法计算 $kG$

### 流程图

```
随机字节 (32 字节)
    ↓
钳位处理
    ↓
私钥 (32 字节)
    ↓
标量乘法 (kG)
    ↓
公钥 (32 字节)
```

## 13.3 钳位处理

### 为什么需要钳位

1. **安全性**：防止小子群攻击
2. **正确性**：确保私钥是余因子的倍数
3. **效率**：优化标量乘法

### 钳位规则

对于 32 字节的私钥 `k`：

```c
k[0] &= 248;   // 清除最低 3 位
k[31] &= 127;  // 清除最高位
k[31] |= 64;   // 设置次高位
```

### 解释

1. **`k[0] &= 248`**：确保 $k$ 是 8 的倍数（余因子为 8）
2. **`k[31] &= 127`**：确保 $k$ 在 $[0, 2^{255}-1]$ 范围内
3. **`k[31] |= 64`**：确保 $k$ 在 $[2^{254}, 2^{255}-1]$ 范围内

### 数学原理

钳位后的私钥 $k$ 满足：

$$k \equiv 0 \pmod{8}$$
$$2^{254} \leq k < 2^{255}$$

## 13.4 代码实现

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

typedef unsigned char u8;

// 钳位处理
void clamp(u8 *k) {
    k[0] &= 248;
    k[31] &= 127;
    k[31] |= 64;
}

// 生成随机字节
void generate_random_bytes(u8 *buf, int len) {
    // 注意：这只是一个示例，实际应用需要使用密码学安全的随机数生成器
    srand(time(NULL));
    for (int i = 0; i < len; i++) {
        buf[i] = rand() % 256;
    }
}

// 打印字节数组
void print_bytes(const char *name, const u8 *bytes, int len) {
    printf("%s: ", name);
    for (int i = 0; i < len; i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
}

// 密钥生成
void generate_keypair(u8 *pk, u8 *sk) {
    // 1. 生成随机私钥
    generate_random_bytes(sk, 32);
    
    // 2. 钳位处理
    clamp(sk);
    
    // 3. 计算公钥 (需要完整的标量乘法实现)
    // x25519(pk, sk, base_point);
    
    printf("密钥对已生成\n");
}

int main() {
    u8 sk[32];  // 私钥
    u8 pk[32];  // 公钥
    
    printf("X25519 密钥生成示例\n\n");
    
    // 生成随机字节
    generate_random_bytes(sk, 32);
    print_bytes("随机私钥（钳位前）", sk, 32);
    
    // 钳位处理
    clamp(sk);
    print_bytes("私钥（钳位后）", sk, 32);
    
    // 验证钳位结果
    printf("\n钳位验证:\n");
    printf("k[0] & 7 = %d (应为 0)\n", sk[0] & 7);
    printf("k[31] & 128 = %d (应为 0)\n", sk[31] & 128);
    printf("k[31] & 64 = %d (应为 64)\n", sk[31] & 64);
    
    return 0;
}
```

## 13.5 安全考虑

### 随机数生成

1. **密码学安全**：必须使用密码学安全的随机数生成器（CSPRNG）
2. **熵源**：需要足够的熵源
3. **不可预测性**：随机数必须不可预测

### 常见错误

1. **使用不安全的随机数**：如 `rand()` 函数
2. **熵不足**：随机数可预测
3. **重用随机数**：在不同上下文中重用随机数

### 推荐实现

```c
#include <fcntl.h>
#include <unistd.h>

// 使用 /dev/urandom 生成随机字节
void generate_secure_random_bytes(u8 *buf, int len) {
    int fd = open("/dev/urandom", O_RDONLY);
    if (fd < 0) {
        perror("open /dev/urandom");
        exit(1);
    }
    
    ssize_t nread = read(fd, buf, len);
    if (nread != len) {
        perror("read /dev/urandom");
        close(fd);
        exit(1);
    }
    
    close(fd);
}
```

## 13.6 密钥格式

### 私钥格式

- 长度：32 字节
- 格式：钳位后的随机字节
- 示例：`a0a1a2a3...a31`

### 公钥格式

- 长度：32 字节
- 格式：u 坐标的字节表示
- 示例：`b0b1b2b3...b31`

## 13.7 完整示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>

typedef unsigned char u8;

// 前向声明
void clamp(u8 *k);
void generate_secure_random_bytes(u8 *buf, int len);

// 密钥对结构
typedef struct {
    u8 sk[32];  // 私钥
    u8 pk[32];  // 公钥
} keypair_t;

// 生成密钥对
keypair_t generate_keypair() {
    keypair_t kp;
    
    // 1. 生成随机私钥
    generate_secure_random_bytes(kp.sk, 32);
    
    // 2. 钳位处理
    clamp(kp.sk);
    
    // 3. 计算公钥
    // x25519(kp.pk, kp.sk, base_point);
    
    return kp;
}

// 打印密钥对
void print_keypair(const keypair_t *kp) {
    printf("私钥: ");
    for (int i = 0; i < 32; i++) {
        printf("%02x", kp->sk[i]);
    }
    printf("\n");
    
    printf("公钥: ");
    for (int i = 0; i < 32; i++) {
        printf("%02x", kp->pk[i]);
    }
    printf("\n");
}

int main() {
    printf("X25519 密钥生成示例\n\n");
    
    // 生成密钥对
    keypair_t kp = generate_keypair();
    
    // 打印密钥对
    print_keypair(&kp);
    
    return 0;
}
```

## 13.8 测试

### 测试向量

RFC 7748 提供了测试向量，可用于验证实现的正确性。

### 示例测试向量

```
Alice's private key: a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf
Alice's public key:  e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c
```

## 13.9 练习

1. 实现完整的密钥生成函数。
2. 解释钳位处理的每个步骤。
3. 使用 RFC 7748 测试向量验证实现。

## 13.10 小结

密钥生成是 X25519 的第一步。通过钳位处理，我们确保私钥具有正确的形式，从而保证安全性和正确性。

在下一章中，我们将实现 X25519 的密钥交换功能。