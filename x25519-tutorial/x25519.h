/*
 * X25519 头文件
 * 基于 Martin Kleppmann 的论文《Implementing Curve25519/X25519》
 */

#ifndef X25519_H
#define X25519_H

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

/* 生成密钥对 */
void generate_keypair(u8 *pk, u8 *sk);

/* X25519 密钥交换 */
void x25519(u8 *out, const u8 *sk, const u8 *pk);

#endif /* X25519_H */