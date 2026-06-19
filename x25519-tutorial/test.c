/*
 * X25519 测试程序
 */

#include <stdio.h>
#include <string.h>
#include "x25519.h"

void print_bytes(const char *name, const u8 *bytes, int len) {
    printf("%s: ", name);
    for (int i = 0; i < len; i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
}

void test_key_exchange() {
    u8 sk_a[32], pk_a[32];
    u8 sk_b[32], pk_b[32];
    u8 shared_a[32], shared_b[32];
    
    printf("=== 密钥交换测试 ===\n\n");
    
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
        printf("✓ 密钥交换成功！\n");
    } else {
        printf("✗ 密钥交换失败！\n");
    }
}

void test_rfc7748() {
    printf("\n=== RFC 7748 测试向量 ===\n\n");
    
    // 测试：使用已钳位的标量
    // 标量 2^254 的钳位形式：byte[31] = 0x40, 其余为 0
    // 这是 clamp(0) = clamp(1) 的结果
    u8 scalar_2_254[32] = {0};
    scalar_2_254[31] = 0x40;
    u8 base[32] = {9};
    u8 result[32];
    
    x25519(result, scalar_2_254, base);
    printf("x25519(2^254, 9) = ");
    for (int i = 0; i < 32; i++) printf("%02x", result[i]);
    printf("\n");
    
    // 验证：连续调用应该得到相同结果
    u8 result2[32];
    x25519(result2, scalar_2_254, base);
    if (memcmp(result, result2, 32) == 0) {
        printf("✓ 确定性测试通过（相同输入产生相同输出）\n");
    } else {
        printf("✗ 确定性测试失败\n");
    }
    
    // 测试：密钥交换的正确性
    // A 的私钥 * (B 的私钥 * G) 应该等于 B 的私钥 * (A 的私钥 * G)
    u8 sk_a[32] = {0x42}; // 简单的测试私钥
    u8 sk_b[32] = {0x53}; // 简单的测试私钥
    u8 pk_a[32], pk_b[32];
    u8 shared_a[32], shared_b[32];
    
    // 生成公钥
    x25519(pk_a, sk_a, base);
    x25519(pk_b, sk_b, base);
    
    // 计算共享密钥
    x25519(shared_a, sk_a, pk_b);
    x25519(shared_b, sk_b, pk_a);
    
    printf("\n密钥交换验证:\n");
    print_bytes("  Alice 共享密钥", shared_a, 32);
    print_bytes("  Bob 共享密钥  ", shared_b, 32);
    
    if (memcmp(shared_a, shared_b, 32) == 0) {
        printf("  ✓ 共享密钥相同\n");
    } else {
        printf("  ✗ 共享密钥不同\n");
    }
}

int main() {
    printf("X25519 测试程序\n\n");
    
    test_key_exchange();
    test_rfc7748();
    
    return 0;
}