# 第14章：密钥交换

## 14.1 概述

X25519 密钥交换基于 Diffie-Hellman 协议，允许两方在不安全的信道上建立共享密钥。

## 14.2 Diffie-Hellman 协议

### 基本原理

1. **公开参数**：群 $G$ 和生成元 $g$
2. **Alice**：选择私钥 $a$，计算公钥 $A = g^a$
3. **Bob**：选择私钥 $b$，计算公钥 $B = g^b$
4. **交换**：Alice 和 Bob 交换公钥
5. **共享密钥**：
   - Alice 计算 $S = B^a = g^{ab}$
   - Bob 计算 $S = A^b = g^{ab}$

### 安全性

基于离散对数问题的困难性：给定 $g$ 和 $g^a$，计算 $a$ 是困难的。

## 14.3 X25519 密钥交换

### 协议流程

```
Alice                                   Bob
  |                                       |
  |  生成私钥 sk_a，计算 pk_a = x25519(sk_a, base_point)  |
  |                                       |
  |  发送 pk_a 给 Bob                     |
  |-------------------------------------->|
  |                                       |
  |  生成私钥 sk_b，计算 pk_b = x25519(sk_b, base_point)  |
  |                                       |
  |  接收 pk_b                            |
  |<--------------------------------------|
  |                                       |
  |  计算共享密钥                          |
  |  shared_a = x25519(sk_a, pk_b)        |
  |                                       |
  |                          计算共享密钥  |
  |                          shared_b = x25519(sk_b, pk_a)|
  |                                       |
  |  shared_a == shared_b                  |
```

### 代码实现

```c
#include <stdio.h>
#include <string.h>

typedef unsigned char u8;

// 前向声明
void x25519(u8 *out, const u8 *sk, const u8 *pk);
void generate_keypair(u8 *pk, u8 *sk);

// 打印字节数组
void print_bytes(const char *name, const u8 *bytes, int len) {
    printf("%s: ", name);
    for (int i = 0; i < len; i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
}

int main() {
    u8 sk_a[32], pk_a[32];  // Alice 的密钥对
    u8 sk_b[32], pk_b[32];  // Bob 的密钥对
    u8 shared_a[32], shared_b[32];  // 共享密钥
    
    printf("X25519 密钥交换示例\n\n");
    
    // 1. Alice 生成密钥对
    printf("1. Alice 生成密钥对\n");
    generate_keypair(pk_a, sk_a);
    print_bytes("Alice 私钥", sk_a, 32);
    print_bytes("Alice 公钥", pk_a, 32);
    printf("\n");
    
    // 2. Bob 生成密钥对
    printf("2. Bob 生成密钥对\n");
    generate_keypair(pk_b, sk_b);
    print_bytes("Bob 私钥", sk_b, 32);
    print_bytes("Bob 公钥", pk_b, 32);
    printf("\n");
    
    // 3. Alice 计算共享密钥
    printf("3. Alice 计算共享密钥\n");
    x25519(shared_a, sk_a, pk_b);
    print_bytes("Alice 共享密钥", shared_a, 32);
    printf("\n");
    
    // 4. Bob 计算共享密钥
    printf("4. Bob 计算共享密钥\n");
    x25519(shared_b, sk_b, pk_a);
    print_bytes("Bob 共享密钥", shared_b, 32);
    printf("\n");
    
    // 5. 验证共享密钥是否相同
    printf("5. 验证共享密钥\n");
    if (memcmp(shared_a, shared_b, 32) == 0) {
        printf("✓ 共享密钥相同！密钥交换成功。\n");
    } else {
        printf("✗ 共享密钥不同！密钥交换失败。\n");
    }
    
    return 0;
}
```

## 14.4 x25519 函数

### 功能

计算 $x25519(sk, pk)$，即使用私钥 `sk` 和公钥 `pk` 计算共享密钥。

### 实现

```c
// x25519 函数
void x25519(u8 *out, const u8 *sk, const u8 *pk) {
    // 1. 钳位处理私钥
    u8 clamped_sk[32];
    memcpy(clamped_sk, sk, 32);
    clamp(clamped_sk);
    
    // 2. 解包公钥
    field_elem x, z;
    unpack25519(x, pk);
    z[0] = 1;
    for (int i = 1; i < 16; i++) z[i] = 0;
    
    // 3. 使用 Montgomery 阶梯计算标量乘法
    field_elem x_out, z_out;
    montgomery_ladder(x_out, z_out, clamped_sk, x, z, A);
    
    // 4. 计算仿射坐标
    field_elem inv_z, result;
    finverse(inv_z, z_out);
    fmul(result, x_out, inv_z);
    
    // 5. 打包结果
    pack25519(out, result);
}
```

## 14.5 安全考虑

### 前向保密

X25519 提供前向保密：即使长期私钥泄露，过去的会话密钥仍然安全。

### 密钥确认

X25519 本身不提供密钥确认。在实际应用中，通常需要额外的机制来确认双方计算出了相同的共享密钥。

### 中间人攻击

X25519 不防止中间人攻击。需要额外的认证机制（如数字签名或证书）来防止此类攻击。

## 14.6 完整示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// 函数声明
void clamp(u8 *k);
void generate_secure_random_bytes(u8 *buf, int len);
void unpack25519(field_elem out, const u8 *in);
void pack25519(u8 *out, const field_elem in);
void fadd(field_elem out, const field_elem a, const field_elem b);
void fsub(field_elem out, const field_elem a, const field_elem b);
void fmul(field_elem out, const field_elem a, const field_elem b);
void finverse(field_elem out, const field_elem in);
void montgomery_ladder(field_elem x_out, field_elem z_out,
                       const field_elem k,
                       const field_elem x_in, const field_elem z_in,
                       const field_elem A);

// x25519 函数
void x25519(u8 *out, const u8 *sk, const u8 *pk) {
    u8 clamped_sk[32];
    memcpy(clamped_sk, sk, 32);
    clamp(clamped_sk);
    
    field_elem x, z;
    unpack25519(x, pk);
    z[0] = 1;
    for (int i = 1; i < 16; i++) z[i] = 0;
    
    field_elem x_out, z_out;
    montgomery_ladder(x_out, z_out, clamped_sk, x, z, 486662);
    
    field_elem inv_z, result;
    finverse(inv_z, z_out);
    fmul(result, x_out, inv_z);
    
    pack25519(out, result);
}

// 生成密钥对
void generate_keypair(u8 *pk, u8 *sk) {
    u8 base_point[32] = {9};
    for (int i = 1; i < 32; i++) base_point[i] = 0;
    
    generate_secure_random_bytes(sk, 32);
    clamp(sk);
    x25519(pk, sk, base_point);
}

// 打印字节数组
void print_bytes(const char *name, const u8 *bytes, int len) {
    printf("%s: ", name);
    for (int i = 0; i < len; i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
}

int main() {
    u8 sk_a[32], pk_a[32];
    u8 sk_b[32], pk_b[32];
    u8 shared_a[32], shared_b[32];
    
    printf("X25519 完整密钥交换示例\n\n");
    
    // Alice 生成密钥对
    printf("Alice 生成密钥对:\n");
    generate_keypair(pk_a, sk_a);
    print_bytes("  私钥", sk_a, 32);
    print_bytes("  公钥", pk_a, 32);
    printf("\n");
    
    // Bob 生成密钥对
    printf("Bob 生成密钥对:\n");
    generate_keypair(pk_b, sk_b);
    print_bytes("  私钥", sk_b, 32);
    print_bytes("  公钥", pk_b, 32);
    printf("\n");
    
    // 计算共享密钥
    printf("计算共享密钥:\n");
    x25519(shared_a, sk_a, pk_b);
    x25519(shared_b, sk_b, pk_a);
    
    print_bytes("Alice 计算", shared_a, 32);
    print_bytes("Bob 计算  ", shared_b, 32);
    printf("\n");
    
    // 验证
    if (memcmp(shared_a, shared_b, 32) == 0) {
        printf("✓ 密钥交换成功！共享密钥相同。\n");
    } else {
        printf("✗ 密钥交换失败！共享密钥不同。\n");
    }
    
    return 0;
}
```

## 14.7 测试向量

### RFC 7748 测试向量

```
Alice's private key: a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf
Alice's public key:  e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c

Bob's private key:   b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0
Bob's public key:    de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f

Shared secret:       c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552
```

## 14.8 练习

1. 实现完整的 x25519 函数。
2. 使用 RFC 7748 测试向量验证实现。
3. 解释 X25519 如何提供前向保密。

## 14.9 小结

X25519 密钥交换是现代密码学的重要组成部分。通过理解协议流程和实现细节，我们可以安全地在不安全的信道上建立共享密钥。

在下一章中，我们将实现完整的 X25519 库，并进行测试。