# 第 15 章：完整实现

> 对应论文：全文（尤其 §4.7、§4.8）与 RFC 7748 §5

## 15.1 本章要回答的问题

前 14 章我们造好了每一块“零件”。本章把它们组装成 `x25519.c` 整机，并回答：

1. 所有函数如何串成一条数据流？
2. 完整代码长什么样？（与仓库中的 `x25519.c` 完全一致）
3. 怎么编译、运行、验证？

## 15.2 调用链总览

```
test.c / rfc7748_check.c
        │  generate_keypair(pk, sk)          x25519(out, sk, pk)
        ▼                                      ▼
┌───────────────────┐        ┌───────────────────────────────┐
│ generate_random_  │        │ x25519                       │
│ bytes (CSPRNG)    │        │   clamp(sk)                  │
│ clamp(sk)         │        │   unpack25519(pk) → x        │
│ x25519(pk,sk,9)   │        │   z = 1                      │
└─────────┬─────────┘        │   montgomery_ladder(x,z)     │
          │                  │   finverse(z_out)            │
          ▼                  │   fmul(x_out, z_out^{-1})    │
┌───────────────────┐        │   pack25519 → out            │
│ montgomery_ladder │        └──────────────┬────────────────┘
│   255 × (fadd,fsub,fmul, swap25519)       │
└─────────┬─────────┘                       ▼
          │                    finverse / fmul / pack25519
          ▼
   (x_out, z_out) 射影结果
```

域层函数（`unpack25519`、`carry25519`、`fadd`、`fsub`、`fmul`、`finverse`、
`pack25519`、`swap25519`）只做一件事，且不依赖任何上层——它们是第 5–9 章的全部成果。曲线层只有 `montgomery_ladder`（第 12 章）。协议层是 `x25519` 与
`generate_keypair`（第 13、14 章）。

## 15.3 完整代码

下面的 `x25519.c` 与仓库文件**逐字一致**。对照每一章的编号阅读：

| 代码 | 章节 |
|------|------|
| `unpack25519` | 第 5 章 |
| `carry25519` | 第 5 章 |
| `fadd` / `fsub` | 第 6 章 |
| `fmul` | 第 7 章 |
| `finverse` | 第 8 章 |
| `pack25519` / `swap25519` | 第 9 章 |
| `clamp` | 第 13 章 |
| `montgomery_ladder` | 第 12 章 |
| `x25519` / `generate_keypair` | 第 14 章 |

```c
/*
 * X25519 完整实现
 * 基于 Martin Kleppmann 的论文《Implementing Curve25519/X25519》
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include "x25519.h"

/* 常量 */
static const u8 base_point[32] = {9};

/* 函数声明 */
static void unpack25519(field_elem out, const u8 *in);
static void pack25519(u8 *out, const field_elem in);
static void carry25519(field_elem elem);
static void fadd(field_elem out, const field_elem a, const field_elem b);
static void fsub(field_elem out, const field_elem a, const field_elem b);
static void fmul(field_elem out, const field_elem a, const field_elem b);
static void finverse(field_elem out, const field_elem in);
static void swap25519(field_elem p, field_elem q, int bit);
static void clamp(u8 *k);
static void montgomery_ladder(field_elem x_out, field_elem z_out,
                              const u8 *k,
                              const field_elem x_in, const field_elem z_in);

/* 随机数生成（第 13 章） */
static void generate_random_bytes(u8 *buf, int len) {
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

/* unpack25519: 字节数组 -> field_elem（第 5 章） */
static void unpack25519(field_elem out, const u8 *in) {
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

/* pack25519: field_elem -> 字节数组，含完整的模 p 归约（第 9 章） */
static void pack25519(u8 *out, const field_elem in) {
    int i, j, carry;
    field_elem m, t;

    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);

    for (j = 0; j < 2; ++j) {
        m[0] = t[0] - 0xffed;
        for(i = 1; i < 15; i++) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
            m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        carry = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        swap25519(t, m, 1 - carry);
    }

    for (i = 0; i < 16; ++i) {
        out[2*i] = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
}

/* carry25519: 进位传播与 38 归约（第 5 章） */
static void carry25519(field_elem elem) {
    int i;
    i64 carry;
    for (i = 0; i < 16; ++i) {
        carry = elem[i] >> 16;
        elem[i] -= carry << 16;
        if (i < 15) elem[i + 1] += carry;
        else elem[0] += 38 * carry;
    }
}

/* fadd: 有限域加法（第 6 章） */
static void fadd(field_elem out, const field_elem a, const field_elem b) {
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] + b[i];
}

/* fsub: 有限域减法（第 6 章） */
static void fsub(field_elem out, const field_elem a, const field_elem b) {
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] - b[i];
}

/* fmul: 有限域乘法（第 7 章） */
static void fmul(field_elem out, const field_elem a, const field_elem b) {
    i64 i, j, product[31];

    for (i = 0; i < 31; ++i) product[i] = 0;

    for (i = 0; i < 16; ++i) {
        for (j = 0; j < 16; ++j) {
            product[i+j] += a[i] * b[j];
        }
    }

    for (i = 0; i < 15; ++i) {
        product[i] += 38 * product[i + 16];
    }

    for (i = 0; i < 16; ++i) {
        out[i] = product[i];
    }

    carry25519(out);
    carry25519(out);
}

/* finverse: 乘法逆元，a^{-1} = a^{p-2}（第 8 章） */
static void finverse(field_elem out, const field_elem in) {
    field_elem c;
    int i;

    for (i = 0; i < 16; ++i) c[i] = in[i];

    for (i = 253; i >= 0; i--) {
        fmul(c, c, c);
        if (i != 2 && i != 4) {
            fmul(c, c, in);
        }
    }

    for (i = 0; i < 16; ++i) out[i] = c[i];
}

/* swap25519: 常数时间条件交换（第 9 章） */
static void swap25519(field_elem p, field_elem q, int bit) {
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}

/* clamp: 钳位处理（第 13 章） */
static void clamp(u8 *k) {
    k[0] &= 248;
    k[31] &= 127;
    k[31] |= 64;
}

/* montgomery_ladder: Montgomery 阶梯（第 12 章） */
static void montgomery_ladder(field_elem x_out, field_elem z_out,
                              const u8 *k,
                              const field_elem x_in, const field_elem z_in) {
    field_elem x0, z0, x1, z1;
    field_elem t1, t2, t3, t4, t5, t6, t7, t8;
    field_elem a24_fe;
    int i;

    /* (A+2)/4 = (486662+2)/4 = 121666（第 12.6 节） */
    a24_fe[0] = 121666;
    for (i = 1; i < 16; i++) a24_fe[i] = 0;

    /* 初始化 R0 = O（射影表示 (1:0)），R1 = P = (x_in : z_in) */
    x0[0] = 1; z0[0] = 0;
    for (i = 1; i < 16; i++) {
        x0[i] = 0; z0[i] = 0;
    }
    for (i = 0; i < 16; i++) {
        x1[i] = x_in[i]; z1[i] = z_in[i];
    }

    /* 处理 k 的每一位（bit 254 .. bit 0，共 255 轮） */
    for (i = 254; i >= 0; i--) {
        /* 第 i 位（小端字节数组） */
        int bit = (k[i / 8] >> (i % 8)) & 1;

        /* 根据 bit 常数时间地交换（低幂点, 高幂点） */
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);

        /* ---- 差分加法：x1/z1 = X_{2i+1}/Z_{2i+1}（含因子 4，见第 12.5 节） ---- */
        fadd(t1, x0, z0);        /* t1 = x0 + z0        (v1) */
        fsub(t2, x0, z0);        /* t2 = x0 - z0        (v2) */
        fadd(t3, x1, z1);        /* t3 = x1 + z1        (v3) */
        fsub(t4, x1, z1);        /* t4 = x1 - z1        (v4) */
        fmul(t5, t1, t4);        /* t5 = (x0+z0)(x1-z1) (v8) */
        fmul(t6, t2, t3);        /* t6 = (x0-z0)(x1+z1) (v7) */
        fadd(t7, t5, t6);        /* t7 = 2(x0x1 - z0z1) (v9) */
        fsub(t8, t5, t6);        /* t8 = -2(x0z1 - x1z0)（平方后符号无影响） */
        fmul(x1, t7, t7);        /* x1 = t7^2 = 4 X_{2i+1}        (v18) */
        fmul(t8, t8, t8);        /* t8 = t8^2 = 4 (x0z1-x1z0)^2   (v11) */
        fmul(z1, x_in, t8);      /* z1 = x_in * t8 = 4 Z_{2i+1}   (v17) */

        /* ---- 倍增：x0/z0 = X_{2i}/Z_{2i} ---- */
        fadd(t1, x0, z0);
        fmul(t1, t1, t1);        /* t1 = (x0+z0)^2               (v5) */
        fsub(t2, x0, z0);
        fmul(t2, t2, t2);        /* t2 = (x0-z0)^2               (v6) */
        fmul(x0, t1, t2);        /* x0 = (x0^2 - z0^2)^2 = X_{2i} (v16) */
        fsub(t3, t1, t2);        /* t3 = t1 - t2 = 4 x0 z0       (v12) */
        fmul(t4, a24_fe, t3);    /* t4 = 121666 * 4x0z0 = (A+2)x0z0 */
        fadd(t5, t2, t4);        /* t5 = (x0-z0)^2 + (A+2)x0z0 = x0^2+Ax0z0+z0^2 */
        fmul(z0, t3, t5);        /* z0 = 4x0z0(...) = Z_{2i}     (v15) */

        /* 交换回来，恢复 (x0,z0) 低幂、(x1,z1) 高幂的顺序 */
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);
    }

    /* 输出 R0 */
    for (i = 0; i < 16; i++) {
        x_out[i] = x0[i]; z_out[i] = z0[i];
    }
}

/* x25519: X25519 密钥交换（第 14 章） */
void x25519(u8 *out, const u8 *sk, const u8 *pk) {
    u8 clamped_sk[32];
    field_elem x, z, x_out, z_out, inv_z, result;

    /* 1. 钳位处理私钥 */
    memcpy(clamped_sk, sk, 32);
    clamp(clamped_sk);

    /* 2. 解包公钥（u 坐标），z 初始化为 1（仿射） */
    unpack25519(x, pk);
    z[0] = 1;
    for (int i = 1; i < 16; i++) z[i] = 0;

    /* 3. Montgomery 阶梯 */
    montgomery_ladder(x_out, z_out, clamped_sk, x, z);

    /* 4. 射影 -> 仿射：x = x_out / z_out（唯一一次除法） */
    finverse(inv_z, z_out);
    fmul(result, x_out, inv_z);

    /* 5. 打包（含完整模 p 归约） */
    pack25519(out, result);
}

/* generate_keypair: 生成密钥对（第 13 章） */
void generate_keypair(u8 *pk, u8 *sk) {
    generate_random_bytes(sk, 32);
    clamp(sk);
    x25519(pk, sk, base_point);
}
```

对应的头文件：

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

## 15.4 编译、运行与验证

```bash
cd x25519-tutorial
make            # 编译 test（test.c + x25519.c）
./test          # 运行：随机密钥交换 + RFC 7748 §6.1 向量
```

以及仓库根目录的独立验证：

```bash
cd ..
gcc -O2 -Wall -Wextra -o rfc7748_check rfc7748_check.c x25519-tutorial/x25519.c
./rfc7748_check   # 应输出 ALL PASS
```

`rfc7748_check.c` 覆盖 RFC 7748 §5.2 的两个标量乘向量与 §6.1 的私钥→公钥向量，全部通过意味着域算术、曲线算术、钳位、打包等每一层都正确。

## 15.5 练习

1. 不看本章代码，尝试默写出 `x25519()` 的 5 个步骤。
2. 修改 `montgomery_ladder`，把 `121666` 换成 `121665` 并同步调整倍增公式（用 $(x0+z0)^2$ 那一路），验证测试仍然通过——体会两种等价常数组合。
3. 给 `test.c` 增加一个测试：用 §6.1 的 Bob 私钥算公钥，验证等于 `de9e…4f`。
4. 分析：为什么 `finverse` 只调用一次而不是在阶梯内部调用？
5. 回顾 12.9 练习 6：为什么“输入 $(X,Z)\ne(0,0)$ 则输出也 $\ne(0,0)$”是常数时间性的必要条件？

## 15.6 小结

- 全部代码 = 8 个域函数 + 1 个阶梯 + 2 个协议函数，每一层都独立可测。
- 教程第 5–14 章与 `x25519.c` 的每个函数一一对应，这是“从零实现”的完整闭环。
- 验证手段：RFC 7748 §5.2（标量乘）与 §6.1（密钥对与共享密钥）。

下一章给出工程配套：测试程序、Makefile、全部测试向量与运行输出。
