# 第10章：曲线方程

## 10.1 概述

Curve25519 使用 Montgomery 曲线形式，本章介绍曲线方程和参数选择。

## 10.2 Montgomery 曲线

### 一般形式

Montgomery 曲线的一般形式为：

$$By^2 = x^3 + Ax^2 + x$$

其中 $A, B$ 是域元素，且 $B(A^2 - 4) \neq 0$。

### Curve25519 参数

Curve25519 使用的参数为：

- $A = 486662$
- $B = 1$

因此曲线方程为：

$$y^2 = x^3 + 486662x^2 + x$$

## 10.3 为什么选择 Montgomery 曲线

### 优势

1. **高效的标量乘法**：Montgomery 阶梯算法
2. **不需要 y 坐标**：节省带宽和计算
3. **良好的安全性质**：抵抗某些侧信道攻击

### 与其他曲线形式的比较

| 曲线形式 | 优点 | 缺点 |
|---------|------|------|
| 短 Weierstrass | 通用性强 | 标量乘法较慢 |
| Montgomery | 标量乘法快 | 只能用于 Diffie-Hellman |
| Edwards | 完全公式 | 实现复杂 |

## 10.4 曲线参数

### 模数

$$p = 2^{255} - 19$$

十六进制表示：

```
0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed
```

### 曲线阶

曲线群的阶为 $8q$，其中：

$$q = 2^{252} + 27742317777372353535851937790883648493$$

$q$ 是素数，$8$ 是余因子。

### 基点

基点（生成元）$g$ 的 x 坐标为 9。

## 10.5 代码验证

### 使用 SageMath 验证

```python
# 模 p 的整数有限域
field = GF(2^255 - 19)

# 构造椭圆曲线
E = EllipticCurve(field, [0, 486662, 0, 1, 0])

# 检查曲线阶
q = 2^252 + 27742317777372353535851937790883648493
print(q.is_prime())  # True
print(E.cardinality() == 8 * q)  # True

# 检查基点
base = 9
g = [field(base), sqrt(field(base^3 + 486662 * base^2 + base))]
print(q * E(g))  # (0 : 1 : 0)，即无穷远点
```

### 使用 C 代码验证

```c
#include <stdio.h>

// 简化验证（仅示意）
int is_on_curve(uint64_t x, uint64_t y, uint64_t p) {
    // 计算 y^2 mod p
    uint64_t y2 = (y * y) % p;
    
    // 计算 x^3 + 486662*x^2 + x mod p
    uint64_t x2 = (x * x) % p;
    uint64_t x3 = (x2 * x) % p;
    uint64_t rhs = (x3 + 486662 * x2 + x) % p;
    
    return y2 == rhs;
}

int main() {
    // 示例：验证点 (9, y) 是否在曲线上
    uint64_t p = (1ULL << 55) - 19;  // 简化
    uint64_t x = 9;
    
    printf("验证点 (%llu, y) 是否在曲线上\n", x);
    printf("需要计算 y^2 = x^3 + 486662*x^2 + x\n");
    
    return 0;
}
```

## 10.6 曲线的安全性

### 离散对数问题

给定点 $P$ 和 $Q = kP$，计算 $k$ 是困难的。这是椭圆曲线密码学安全性的基础。

### 安全级别

Curve25519 提供约 128 位的安全级别，与 AES-128 相当。

### 已知攻击

1. **Pollard's rho 算法**：时间复杂度 $O(\sqrt{q})$
2. **Pohlig-Hellman 算法**：利用群阶的因子分解
3. **MOV 攻击**：将 ECDLP 转换为 DLP

## 10.7 代码示例

```c
#include <stdio.h>
#include <stdint.h>

// 曲线参数
#define A 486662
#define P ((1ULL << 55) - 19)  // 简化，实际是 2^255 - 19

// 简化验证函数
int is_on_curve_simplified(uint64_t x, uint64_t y) {
    // 计算 y^2 mod P
    uint64_t y2 = (y * y) % P;
    
    // 计算 x^3 + A*x^2 + x mod P
    uint64_t x2 = (x * x) % P;
    uint64_t x3 = (x2 * x) % P;
    uint64_t rhs = (x3 + A * x2 + x) % P;
    
    return y2 == rhs;
}

int main() {
    printf("Curve25519 曲线参数:\n");
    printf("A = %d\n", A);
    printf("P = %llu\n", P);
    
    // 验证基点 (9, y)
    uint64_t x = 9;
    printf("\n验证基点 x = %llu\n", x);
    printf("需要计算 y 使得 y^2 = x^3 + %d*x^2 + x\n", A);
    
    return 0;
}
```

## 10.8 练习

1. 解释为什么 Montgomery 曲线的余因子总是 4 的倍数。
2. 计算 Curve25519 曲线的阶。
3. 验证点 (9, y) 是否在曲线上（需要计算 y）。

## 10.9 小结

Curve25519 使用 Montgomery 曲线形式，具有高效的标量乘法和良好的安全性质。理解曲线方程和参数是实现椭圆曲线运算的基础。

在下一章中，我们将实现椭圆曲线的点加法运算。