# 第12章：标量乘法

## 12.1 概述

标量乘法是椭圆曲线密码学的核心操作，计算 $kP$，其中 $k$ 是标量，$P$ 是曲线点。

## 12.2 标量乘法的定义

### 数学定义

对于标量 $k$ 和点 $P$，标量乘法定义为：

$$kP = \underbrace{P + P + \cdots + P}_{k \text{ times}}$$

### 性质

1. **结合律**：$(a + b)P = aP + bP$
2. **交换律**：$a(bP) = b(aP)$
3. **单位元**：$0P = O$（无穷远点）

## 12.3 朴素算法

### 重复加法

最简单的算法是重复加法：

```c
// 朴素标量乘法（不安全，仅示意）
void scalar_mul_naive(field_elem x3, field_elem y3,
                      const field_elem k,
                      const field_elem x1, const field_elem y1,
                      const field_elem A)
{
    field_elem x_acc, y_acc;
    
    // 初始化为无穷远点
    // ...
    
    for (int i = 0; i < k; i++) {
        point_add_affine(x_acc, y_acc, x_acc, y_acc, x1, y1, A);
    }
    
    // 复制结果
    // ...
}
```

### 问题

1. **时间复杂度**：$O(k)$，对于大 $k$ 不可行
2. **非常数时间**：执行时间依赖于 $k$，可能泄露信息

## 12.4 Montgomery 阶梯算法

### 算法原理

Montgomery 阶梯算法是一种常数时间的标量乘法算法，专为 Montgomery 曲线设计。

### 算法步骤

1. 初始化：$R_0 = O$，$R_1 = P$
2. 对于 $k$ 的每一位（从最高位到最低位）：
   - 如果当前位为 0：$R_1 = R_0 + R_1$，$R_0 = 2R_0$
   - 如果当前位为 1：$R_0 = R_0 + R_1$，$R_1 = 2R_1$
3. 返回 $R_0$

### 常数时间性

无论当前位是 0 还是 1，都执行相同的操作（一次加法和一次倍增），只是操作数不同。

## 12.5 代码实现

```c
#include <stdio.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// 前向声明
static void fadd(field_elem out, const field_elem a, const field_elem b);
static void fsub(field_elem out, const field_elem a, const field_elem b);
static void fmul(field_elem out, const field_elem a, const field_elem b);
static void swap25519(field_elem p, field_elem q, int bit);

// Montgomery 阶梯算法
void montgomery_ladder(field_elem x_out, field_elem z_out,
                       const field_elem k,
                       const field_elem x_in, const field_elem z_in,
                       const field_elem A)
{
    field_elem x0, z0, x1, z1;
    field_elem t1, t2, t3, t4;
    
    // 初始化
    // R0 = O (无穷远点，用 (1:0) 表示)
    x0[0] = 1; z0[0] = 0;
    for (int i = 1; i < 16; i++) {
        x0[i] = 0; z0[i] = 0;
    }
    
    // R1 = P
    for (int i = 0; i < 16; i++) {
        x1[i] = x_in[i]; z1[i] = z_in[i];
    }
    
    // 处理 k 的每一位
    for (int i = 253; i >= 0; i--) {
        // 获取当前位
        int bit = (k[i/64] >> (i%64)) & 1;
        
        // 根据当前位交换 R0 和 R1
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);
        
        // 执行加法和倍增
        // 这里需要实现差分加法和倍增公式
        // 简化实现...
        
        // 再次交换（恢复顺序）
        swap25519(x0, x1, bit);
        swap25519(z0, z1, bit);
    }
    
    // 输出 R0
    for (int i = 0; i < 16; i++) {
        x_out[i] = x0[i]; z_out[i] = z0[i];
    }
}

int main() {
    printf("Montgomery 阶梯算法已定义\n");
    printf("需要完整的有限域算术和点运算实现才能运行\n");
    return 0;
}
```

## 12.6 差分加法和倍增

### 差分加法公式

给定 $P = (X_1 : Z_1)$、$Q = (X_2 : Z_2)$ 和 $P - Q = (X_3 : Z_3)$，则：

$$X_{P+Q} = Z_{P-Q}((X_P - Z_P)(X_Q + Z_Q) + (X_P + Z_P)(X_Q - Z_Q))^2$$
$$Z_{P+Q} = X_{P-Q}((X_P - Z_P)(X_Q + Z_Q) - (X_P + Z_P)(X_Q - Z_Q))^2$$

### 倍增公式

给定 $P = (X_1 : Z_1)$，则：

$$X_{2P} = (X_1 + Z_1)^2 \cdot (X_1 - Z_1)^2$$
$$Z_{2P} = ((X_1 + Z_1)^2 - (X_1 - Z_1)^2) \cdot ((X_1 + Z_1)^2 + \frac{A-2}{4} \cdot ((X_1 + Z_1)^2 - (X_1 - Z_1)^2))$$

## 12.7 完整实现

```c
// 差分加法
void differential_addition(field_elem x3, field_elem z3,
                           const field_elem x1, const field_elem z1,
                           const field_elem x2, const field_elem z2,
                           const field_elem x_diff, const field_elem z_diff)
{
    field_elem t1, t2, t3, t4;
    
    // t1 = (x1 - z1) * (x2 + z2)
    fsub(t1, x1, z1);
    fadd(t2, x2, z2);
    fmul(t1, t1, t2);
    
    // t2 = (x1 + z1) * (x2 - z2)
    fadd(t2, x1, z1);
    fsub(t3, x2, z2);
    fmul(t2, t2, t3);
    
    // t3 = t1 + t2
    fadd(t3, t1, t2);
    
    // t4 = t1 - t2
    fsub(t4, t1, t2);
    
    // x3 = z_diff * t3^2
    fmul(t3, t3, t3);
    fmul(x3, z_diff, t3);
    
    // z3 = x_diff * t4^2
    fmul(t4, t4, t4);
    fmul(z3, x_diff, t4);
}

// 倍增
void point_double(field_elem x3, field_elem z3,
                  const field_elem x1, const field_elem z1,
                  const field_elem A)
{
    field_elem t1, t2, t3, t4;
    
    // t1 = (x1 + z1)^2
    fadd(t1, x1, z1);
    fmul(t1, t1, t1);
    
    // t2 = (x1 - z1)^2
    fsub(t2, x1, z1);
    fmul(t2, t2, t2);
    
    // x3 = t1 * t2
    fmul(x3, t1, t2);
    
    // t3 = t1 - t2
    fsub(t3, t1, t2);
    
    // t4 = (A + 2) / 4 * t3
    // 简化实现，实际需要计算 (A+2)/4
    fmul(t4, t3, A);  // 简化
    
    // z3 = t3 * (t2 + t4)
    fadd(t4, t2, t4);
    fmul(z3, t3, t4);
}
```

## 12.8 性能分析

### 时间复杂度

- Montgomery 阶梯：$O(\log k)$ 次运算
- 每次迭代：1 次加法 + 1 次倍增
- 总复杂度：$O(\log k)$

### 空间复杂度

- 需要存储两个点 $R_0$ 和 $R_1$
- 总空间：$O(1)$

## 12.9 安全性

### 常数时间性

Montgomery 阶梯算法是常数时间的：

1. **无秘密依赖分支**：所有条件都依赖于公开值
2. **固定迭代次数**：总是执行 254 次迭代
3. **固定操作次数**：每次迭代执行相同的操作

### 抵抗侧信道攻击

1. **时间攻击**：常数时间执行
2. **简单能量分析**：操作序列固定
3. **差分能量分析**：需要额外防护

## 12.10 练习

1. 推导 Montgomery 曲线的差分加法公式。
2. 实现完整的 Montgomery 阶梯算法。
3. 解释为什么 Montgomery 阶梯算法是常数时间的。

## 12.11 小结

Montgomery 阶梯算法是实现标量乘法的高效方法，特别适合 Montgomery 曲线。通过常数时间实现，可以抵抗侧信道攻击。

在下一章中，我们将实现 X25519 的密钥生成功能。