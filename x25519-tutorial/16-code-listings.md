# 第 16 章：工程配套与测试

> 配套：README、Makefile、test.c、rfc7748_check.c

## 16.1 本章内容

第 15 章给出了 `x25519.c` 的完整实现。本章补齐工程配套：头文件、测试程序、构建脚本、全部 RFC 7748 测试向量，以及运行方法与常见问题。

## 16.2 文件结构

```
x25519-tutorial/
├── README.md            教程总览与勘误说明
├── 01~17*.md            教程正文
├── x25519.h             头文件（类型与公开接口）
├── x25519.c             完整实现（第 15 章）
├── test.c               测试程序（随机交换 + RFC 7748 全部向量）
└── Makefile             构建脚本

x25519/
└── rfc7748_check.c      RFC 7748 测试向量独立验证
```

## 16.3 x25519.h

```c
/*
 * X25519 头文件
 * 基于 Martin Kleppmann 的论文《Implementing Curve25519/X25519》
 */

#ifndef X25519_H
#define X25519_H

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

/* 生成密钥对：pk = 公钥，sk = 私钥 */
void generate_keypair(u8 *pk, u8 *sk);

/* X25519 密钥交换：out = X25519(sk, pk) */
void x25519(u8 *out, const u8 *sk, const u8 *pk);

#endif /* X25519_H */
```

## 16.4 test.c

测试程序覆盖三类测试：随机密钥交换、RFC 7748 §5.2 标量乘向量、RFC 7748 §6.1
Diffie-Hellman 向量。完整内容与仓库中的 `test.c` 一致：

```c
/*
 * X25519 测试程序
 *
 * 覆盖三类测试：
 *   1. 随机密钥对 + 密钥交换（双方共享密钥相等）
 *   2. RFC 7748 §5.2 标量乘测试向量（2 组）
 *   3. RFC 7748 §6.1 Diffie-Hellman 测试向量（私钥 -> 公钥 -> 共享密钥）
 *
 * 注意：本实现全部使用 RFC 7748 的真实测试向量。
 */

#include <stdio.h>
#include <string.h>
#include "x25519.h"

static int fails = 0;

static void print_bytes(const char *name, const u8 *bytes, int len) {
    printf("%s: ", name);
    for (int i = 0; i < len; i++) printf("%02x", bytes[i]);
    printf("\n");
}

/* 检查 32 字节结果是否与期望一致 */
static void check(const char *name, const u8 *got, const u8 *want) {
    if (memcmp(got, want, 32) == 0) {
        printf("  PASS  %s\n", name);
    } else {
        printf("  FAIL  %s\n", name);
        print_bytes("    got ", got, 32);
        print_bytes("    want", want, 32);
        fails++;
    }
}

/* 测试 1：随机密钥交换 */
static void test_key_exchange(void) {
    u8 sk_a[32], pk_a[32];
    u8 sk_b[32], pk_b[32];
    u8 shared_a[32], shared_b[32];

    printf("=== 测试 1：随机密钥交换 ===\n\n");

    generate_keypair(pk_a, sk_a);
    generate_keypair(pk_b, sk_b);
    print_bytes("Alice 私钥", sk_a, 32);
    print_bytes("Alice 公钥", pk_a, 32);
    print_bytes("Bob   私钥", sk_b, 32);
    print_bytes("Bob   公钥", pk_b, 32);

    x25519(shared_a, sk_a, pk_b);
    x25519(shared_b, sk_b, pk_a);
    print_bytes("Alice 共享密钥", shared_a, 32);
    print_bytes("Bob   共享密钥", shared_b, 32);

    if (memcmp(shared_a, shared_b, 32) == 0) {
        printf("  PASS  共享密钥一致\n");
    } else {
        printf("  FAIL  共享密钥不一致\n");
        fails++;
    }
    printf("\n");
}

/* 测试 2：RFC 7748 §5.2 标量乘测试向量 */
static void test_rfc7748_vectors(void) {
    printf("=== 测试 2：RFC 7748 §5.2 标量乘测试向量 ===\n\n");

    /* 向量 1 */
    {
        u8 scalar[32] = {0xa5,0x46,0xe3,0x6b,0xf0,0x52,0x7c,0x9d,
                         0x3b,0x16,0x15,0x4b,0x82,0x46,0x5e,0xdd,
                         0x62,0x14,0x4c,0x0a,0xc1,0xfc,0x5a,0x18,
                         0x50,0x6a,0x22,0x44,0xba,0x44,0x9a,0xc4};
        u8 u[32] = {0xe6,0xdb,0x68,0x67,0x58,0x30,0x30,0xdb,
                    0x35,0x94,0xc1,0xa4,0x24,0xb1,0x5f,0x7c,
                    0x72,0x66,0x24,0xec,0x26,0xb3,0x35,0x3b,
                    0x10,0xa9,0x03,0xa6,0xd0,0xab,0x1c,0x4c};
        u8 want[32] = {0xc3,0xda,0x55,0x37,0x9d,0xe9,0xc6,0x90,
                       0x8e,0x94,0xea,0x4d,0xf2,0x8d,0x08,0x4f,
                       0x32,0xec,0xcf,0x03,0x49,0x1c,0x71,0xf7,
                       0x54,0xb4,0x07,0x55,0x77,0xa2,0x85,0x52};
        u8 out[32];
        x25519(out, scalar, u);
        check("RFC 7748 §5.2 向量 1：X25519(scalar, u)", out, want);
    }

    /* 向量 2 */
    {
        u8 scalar[32] = {0x4b,0x66,0xe9,0xd4,0xd1,0xb4,0x67,0x3c,
                         0x5a,0xd2,0x26,0x91,0x95,0x7d,0x6a,0xf5,
                         0xc1,0x1b,0x64,0x21,0xe0,0xea,0x01,0xd4,
                         0x2c,0xa4,0x16,0x9e,0x79,0x18,0xba,0x0d};
        u8 u[32] = {0xe5,0x21,0x0f,0x12,0x78,0x68,0x11,0xd3,
                    0xf4,0xb7,0x95,0x9d,0x05,0x38,0xae,0x2c,
                    0x31,0xdb,0xe7,0x10,0x6f,0xc0,0x3c,0x3e,
                    0xfc,0x4c,0xd5,0x49,0xc7,0x15,0xa4,0x93};
        u8 want[32] = {0x95,0xcb,0xde,0x94,0x76,0xe8,0x90,0x7d,
                       0x7a,0xad,0xe4,0x5c,0xb4,0xb8,0x73,0xf8,
                       0x8b,0x59,0x5a,0x68,0x79,0x9f,0xa1,0x52,
                       0xe6,0xf8,0xf7,0x64,0x7a,0xac,0x79,0x57};
        u8 out[32];
        x25519(out, scalar, u);
        check("RFC 7748 §5.2 向量 2：X25519(scalar, u)", out, want);
    }
    printf("\n");
}

/* 测试 3：RFC 7748 §6.1 Diffie-Hellman 测试向量 */
static void test_rfc7748_dh(void) {
    u8 alice_sk[32] = {0x77,0x07,0x6d,0x0a,0x73,0x18,0xa5,0x7d,
                       0x3c,0x16,0xc1,0x72,0x51,0xb2,0x66,0x45,
                       0xdf,0x4c,0x2f,0x87,0xeb,0xc0,0x99,0x2a,
                       0xb1,0x77,0xfb,0xa5,0x1d,0xb9,0x2c,0x2a};
    u8 alice_pk[32] = {0x85,0x20,0xf0,0x09,0x89,0x30,0xa7,0x54,
                       0x74,0x8b,0x7d,0xdc,0xb4,0x3e,0xf7,0x5a,
                       0x0d,0xbf,0x3a,0x0d,0x26,0x38,0x1a,0xf4,
                       0xeb,0xa4,0xa9,0x8e,0xaa,0x9b,0x4e,0x6a};
    u8 bob_sk[32] = {0x5d,0xab,0x08,0x7e,0x62,0x4a,0x8a,0x4b,
                     0x79,0xe1,0x7f,0x8b,0x83,0x80,0x0e,0xe6,
                     0x6f,0x3b,0xb1,0x29,0x26,0x18,0xb6,0xfd,
                     0x1c,0x2f,0x8b,0x27,0xff,0x88,0xe0,0xeb};
    u8 bob_pk[32] = {0xde,0x9e,0xdb,0x7d,0x7b,0x7d,0xc1,0xb4,
                     0xd3,0x5b,0x61,0xc2,0xec,0xe4,0x35,0x37,
                     0x3f,0x83,0x43,0xc8,0x5b,0x78,0x67,0x4d,
                     0xad,0xfc,0x7e,0x14,0x6f,0x88,0x2b,0x4f};
    u8 shared[32] = {0x4a,0x5d,0x9d,0x5b,0xa4,0xce,0x2d,0xe1,
                     0x72,0x8e,0x3b,0xf4,0x80,0x35,0x0f,0x25,
                     0xe0,0x7e,0x21,0xc9,0x47,0xd1,0x9e,0x33,
                     0x76,0xf0,0x9b,0x3c,0x1e,0x16,0x17,0x42};
    u8 base[32] = {9};
    u8 pk[32], s1[32], s2[32];

    printf("=== 测试 3：RFC 7748 §6.1 Diffie-Hellman 测试向量 ===\n\n");

    x25519(pk, alice_sk, base);
    check("Alice 私钥 -> 公钥", pk, alice_pk);

    x25519(pk, bob_sk, base);
    check("Bob 私钥 -> 公钥", pk, bob_pk);

    x25519(s1, alice_sk, bob_pk);
    check("Alice 计算的共享密钥", s1, shared);

    x25519(s2, bob_sk, alice_pk);
    check("Bob 计算的共享密钥", s2, shared);
    printf("\n");
}

int main(void) {
    printf("X25519 测试程序\n\n");

    test_key_exchange();
    test_rfc7748_vectors();
    test_rfc7748_dh();

    if (fails) {
        printf("%d 个测试失败\n", fails);
        return 1;
    }
    printf("全部测试通过\n");
    return 0;
}
```

## 16.5 Makefile

```makefile
CC = gcc
CFLAGS = -O2 -Wall -Wextra

all: test

test: test.c x25519.c x25519.h
	$(CC) $(CFLAGS) -o $@ test.c x25519.c

clean:
	rm -f test

.PHONY: all clean
```

## 16.6 编译、运行与预期输出

```bash
cd x25519-tutorial
make
./test
```

预期输出（随机部分每次不同，向量部分固定）：

```
X25519 测试程序

=== 测试 1：随机密钥交换 ===

Alice 私钥: 20d88358...
Alice 公钥: f797c488...
Bob   私钥: 50c8cbe7...
Bob   公钥: ac12774a...
Alice 共享密钥: 416f1fcb...
Bob   共享密钥: 416f1fcb...
  PASS  共享密钥一致

=== 测试 2：RFC 7748 §5.2 标量乘测试向量 ===

  PASS  RFC 7748 §5.2 向量 1：X25519(scalar, u)
  PASS  RFC 7748 §5.2 向量 2：X25519(scalar, u)

=== 测试 3：RFC 7748 §6.1 Diffie-Hellman 测试向量 ===

  PASS  Alice 私钥 -> 公钥
  PASS  Bob 私钥 -> 公钥
  PASS  Alice 计算的共享密钥
  PASS  Bob 计算的共享密钥

全部测试通过
```

仓库根目录的独立验证：

```bash
cd ..
gcc -O2 -Wall -Wextra -o rfc7748_check rfc7748_check.c x25519-tutorial/x25519.c
./rfc7748_check
# 输出 6 个 PASS 与 ALL PASS
```

## 16.7 测试向量速查

### RFC 7748 §5.2（直接测 `X25519(k, u)`）

```
向量 1：
  scalar  a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4
  u       e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c
  输出    c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552

向量 2：
  scalar  4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d
  u       e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493
  输出    95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957
```

### RFC 7748 §6.1（密钥对与共享密钥）

```
Alice 私钥  77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a
Alice 公钥  8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a
Bob   私钥  5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb
Bob   公钥  de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f
共享密钥    4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742
```

## 16.8 常见问题（FAQ）

**Q：教程里为什么不用 “a0a1…bf → e6db…” 那组数据？**
A：那组数据不在 RFC 7748 中（`e6db…` 是 §5.2 向量 1 的 u 坐标输入，`c3da…` 是它的输出，与 Alice/Bob 密钥对无关）。本教程全部使用 RFC 7748 §5.2 与 §6.1 的真实向量，`test.c` 与 `rfc7748_check.c` 也据此编写。

**Q：为什么 `montgomery_ladder` 里取位是 `k[i/8]` 而不是 `k[i/64]`？**
A：`k` 是 32 字节数组（`u8`），第 $i$ 位在字节 `k[i/8]` 的第 `(i%8)` 位（`i/64` 是对 64 位字数组的写法）。用 `i/8` 才不会越界。

**Q：`121665` 和 `121666` 到底用哪个？**
A：两者分别对应 $(A-2)/4$ 与 $(A+2)/4$，配合不同的平方项组合得到相同结果（第 12.6 节）。RFC 7748 用 `121665`，本仓库（TweetNaCl 风格）用 `121666`。

**Q：如何确认我的实现是常数时间的？**
A：检查三点：没有依赖秘密的分支、循环次数固定、没有依赖数据的数组索引。本实现中唯一的 `if` 都只依赖公开的循环变量。真正的常数时间验证还需要在目标硬件上做时序测量（本教程不涉及）。

## 16.9 小结

- 工程配套 = 头文件 + 实现 + 测试 + Makefile，`make && ./test` 一键验证。
- RFC 7748 §5.2/§6.1 的真实向量覆盖了从域算术到协议的全部层次。
- 至此，从第 1 章的模运算到第 16 章的完整工程，X25519 的从零实现全部完成。
