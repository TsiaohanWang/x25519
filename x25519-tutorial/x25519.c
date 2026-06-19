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

/* 随机数生成 */
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

/* unpack25519: 字节数组 -> field_elem */
static void unpack25519(field_elem out, const u8 *in) {
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

/* pack25519: field_elem -> 字节数组 */
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

/* carry25519: 进位处理 */
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

/* fadd: 有限域加法 */
static void fadd(field_elem out, const field_elem a, const field_elem b) {
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] + b[i];
}

/* fsub: 有限域减法 */
static void fsub(field_elem out, const field_elem a, const field_elem b) {
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] - b[i];
}

/* fmul: 有限域乘法 */
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

/* finverse: 乘法逆元 */
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

/* swap25519: 常数时间交换 */
static void swap25519(field_elem p, field_elem q, int bit) {
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}

/* clamp: 钳位处理 */
static void clamp(u8 *k) {
    k[0] &= 248;
    k[31] &= 127;
    k[31] |= 64;
}

/* montgomery_ladder: Montgomery 阶梯算法 */
static void montgomery_ladder(field_elem x_out, field_elem z_out,
                              const u8 *k,
                              const field_elem x_in, const field_elem z_in) {
    field_elem x0, z0, x1, z1;
    field_elem t1, t2, t3, t4, t5, t6, t7, t8;
    field_elem a24_fe;
    int i;
    
    // (A+2)/4 = (486662+2)/4 = 121666
    a24_fe[0] = 121666;
    for (i = 1; i < 16; i++) a24_fe[i] = 0;
    
    // 初始化 R0 = O (无穷远点，用 (1:0) 表示)
    x0[0] = 1; z0[0] = 0;
    for (i = 1; i < 16; i++) {
        x0[i] = 0; z0[i] = 0;
    }
    
    // 初始化 R1 = P
    for (i = 0; i < 16; i++) {
        x1[i] = x_in[i]; z1[i] = z_in[i];
    }
    
    // 处理 k 的每一位（从第 254 位到第 0 位）
    for (i = 254; i >= 0; i--) {
        // 获取当前位（小端序字节数组）
        int bit = (k[i / 8] >> (i % 8)) & 1;
        
        // 根据当前位交换 R0 和 R1
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);
        
        // 差分加法: R1 = R0 + R1, 使用 R0 - R1 = P (已知)
        // t1 = x0 + z0
        fadd(t1, x0, z0);
        // t2 = x0 - z0
        fsub(t2, x0, z0);
        // t3 = x1 + z1
        fadd(t3, x1, z1);
        // t4 = x1 - z1
        fsub(t4, x1, z1);
        // t5 = t1 * t4
        fmul(t5, t1, t4);
        // t6 = t2 * t3
        fmul(t6, t2, t3);
        // t7 = t5 + t6
        fadd(t7, t5, t6);
        // t8 = t5 - t6
        fsub(t8, t5, t6);
        // x1 = Z_diff * (e+d)^2 = 1 * (e+d)^2
        fmul(x1, t7, t7);
        // z1 = X_diff * (e-d)^2 = x_in * (e-d)^2
        fmul(t8, t8, t8);
        fmul(z1, x_in, t8);
        
        // 倍增: R0 = 2 * R0
        // t1 = (x0 + z0)^2
        fadd(t1, x0, z0);
        fmul(t1, t1, t1);
        // t2 = (x0 - z0)^2
        fsub(t2, x0, z0);
        fmul(t2, t2, t2);
        // x0 = t1 * t2
        fmul(x0, t1, t2);
        // t3 = t1 - t2
        fsub(t3, t1, t2);
        // t4 = ((A+2)/4) * t3
        fmul(t4, a24_fe, t3);
        // z0 = t3 * (t2 + t4)
        fadd(t5, t2, t4);
        fmul(z0, t3, t5);
        
        // 再次交换（恢复顺序）
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);
    }
    
    // 输出 R0
    for (i = 0; i < 16; i++) {
        x_out[i] = x0[i]; z_out[i] = z0[i];
    }
}

/* x25519: X25519 密钥交换 */
void x25519(u8 *out, const u8 *sk, const u8 *pk) {
    u8 clamped_sk[32];
    field_elem x, z, x_out, z_out, inv_z, result;
    
    // 1. 钳位处理私钥
    memcpy(clamped_sk, sk, 32);
    clamp(clamped_sk);
    
    // 2. 解包公钥
    unpack25519(x, pk);
    z[0] = 1;
    for (int i = 1; i < 16; i++) z[i] = 0;
    
    // 3. 使用 Montgomery 阶梯计算标量乘法
    montgomery_ladder(x_out, z_out, clamped_sk, x, z);
    
    // 4. 计算仿射坐标: x = x_out / z_out
    finverse(inv_z, z_out);
    fmul(result, x_out, inv_z);
    
    // 5. 打包结果
    pack25519(out, result);
}

/* generate_keypair: 生成密钥对 */
void generate_keypair(u8 *pk, u8 *sk) {
    generate_random_bytes(sk, 32);
    clamp(sk);
    x25519(pk, sk, base_point);
}