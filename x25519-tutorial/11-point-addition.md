# 第11章：点加法

## 11.1 概述

点加法是椭圆曲线群运算的基本操作。本章介绍如何在 Montgomery 曲线上实现点加法。

## 11.2 点加法的几何意义

### 基本思想

给定曲线上的两个点 $P$ 和 $Q$，点加法 $P + Q$ 的几何意义是：

1. 画一条通过 $P$ 和 $Q$ 的直线
2. 该直线与曲线相交于第三点 $R'$
3. $P + Q$ 是 $R'$ 关于 x 轴的对称点

### 特殊情况

1. **$P = O$（无穷远点）**：$O + Q = Q$
2. **$Q = O$**：$P + O = P$
3. **$P = -Q$**：$P + Q = O$
4. **$P = Q$**：使用切线（点倍增）

## 11.3 仿射坐标公式

### 点加法（$P \neq Q$）

给定 $P = (x_1, y_1)$ 和 $Q = (x_2, y_2)$，其中 $x_1 \neq x_2$：

$$\lambda = \frac{y_2 - y_1}{x_2 - x_1}$$
$$x_3 = \lambda^2 - A - x_1 - x_2$$
$$y_3 = \lambda(x_1 - x_3) - y_1$$

### 点倍增（$P = Q$）

给定 $P = (x_1, y_1)$，其中 $y_1 \neq 0$：

$$\lambda = \frac{3x_1^2 + 2Ax_1 + 1}{2y_1}$$
$$x_3 = \lambda^2 - A - 2x_1$$
$$y_3 = \lambda(x_1 - x_3) - y_1$$

## 11.4 射影坐标

### 为什么使用射影坐标

仿射坐标需要除法运算，这在有限域中是昂贵的。射影坐标可以避免除法，提高效率。

### 射影坐标表示

点 $(x, y)$ 在射影坐标中表示为 $(X : Y : Z)$，其中：

$$x = \frac{X}{Z}, \quad y = \frac{Y}{Z}$$

### 射影坐标公式

对于 Montgomery 曲线 $y^2 = x^3 + Ax^2 + x$，射影坐标下的曲线方程为：

$$Y^2 Z = X^3 + A X^2 Z + X Z^2$$

## 11.5 点倍增公式推导

### 从仿射坐标推导

仿射坐标下的点倍增公式：

$$\lambda = \frac{3x_1^2 + 2Ax_1 + 1}{2y_1}$$
$$x_3 = \lambda^2 - A - 2x_1$$
$$y_3 = \lambda(x_1 - x_3) - y_1$$

### 转换为射影坐标

将 $x = X/Z$ 和 $y = Y/Z$ 代入：

$$\lambda = \frac{3(X_1/Z_1)^2 + 2A(X_1/Z_1) + 1}{2(Y_1/Z_1)} = \frac{3X_1^2 + 2AX_1Z_1 + Z_1^2}{2Y_1Z_1}$$

### 最终公式

设 $P = (X_1 : Y_1 : Z_1)$，则 $2P = (X_3 : Y_3 : Z_3)$，其中：

$$X_3 = (3X_1^2 + 2AX_1Z_1 + Z_1^2)^2 - 8X_1Y_1^2Z_1$$
$$Y_3 = (3X_1^2 + 2AX_1Z_1 + Z_1^2)(4X_1Y_1^2Z_1 - X_3) - 8Y_1^4Z_1^2$$
$$Z_3 = (2Y_1Z_1)^3$$

## 11.6 点加法公式推导

### 差分加法公式

对于 Montgomery 曲线，可以使用差分加法公式，这不需要 y 坐标：

给定 $P = (X_1 : Z_1)$ 和 $Q = (X_2 : Z_2)$ 以及 $P - Q = (X_3 : Z_3)$，则：

$$X_{P+Q} = Z_{P-Q}((X_P - Z_P)(X_Q + Z_Q) + (X_P + Z_P)(X_Q - Z_Q))^2$$
$$Z_{P+Q} = X_{P-Q}((X_P - Z_P)(X_Q + Z_Q) - (X_P + Z_P)(X_Q - Z_Q))^2$$

## 11.7 代码实现

```c
#include <stdio.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// 前向声明
static void fadd(field_elem out, const field_elem a, const field_elem b);
static void fsub(field_elem out, const field_elem a, const field_elem b);
static void fmul(field_elem out, const field_elem a, const field_elem b);
static void finverse(field_elem out, const field_elem in);

// 点加法（仿射坐标）
void point_add_affine(field_elem x3, field_elem y3,
                      const field_elem x1, const field_elem y1,
                      const field_elem x2, const field_elem y2,
                      const field_elem A)
{
    field_elem lambda, t1, t2, t3;
    
    // 计算斜率 lambda = (y2 - y1) / (x2 - x1)
    fsub(t1, y2, y1);      // t1 = y2 - y1
    fsub(t2, x2, x1);      // t2 = x2 - x1
    finverse(t3, t2);       // t3 = 1 / (x2 - x1)
    fmul(lambda, t1, t3);   // lambda = (y2 - y1) / (x2 - x1)
    
    // 计算 x3 = lambda^2 - A - x1 - x2
    fmul(t1, lambda, lambda);  // t1 = lambda^2
    fsub(t1, t1, A);           // t1 = lambda^2 - A
    fsub(t1, t1, x1);          // t1 = lambda^2 - A - x1
    fsub(x3, t1, x2);          // x3 = lambda^2 - A - x1 - x2
    
    // 计算 y3 = lambda * (x1 - x3) - y1
    fsub(t1, x1, x3);          // t1 = x1 - x3
    fmul(t2, lambda, t1);      // t2 = lambda * (x1 - x3)
    fsub(y3, t2, y1);          // y3 = lambda * (x1 - x3) - y1
}

// 点倍增（仿射坐标）
void point_double_affine(field_elem x3, field_elem y3,
                         const field_elem x1, const field_elem y1,
                         const field_elem A)
{
    field_elem lambda, t1, t2, t3;
    
    // 计算斜率 lambda = (3*x1^2 + 2*A*x1 + 1) / (2*y1)
    fmul(t1, x1, x1);          // t1 = x1^2
    fmul(t2, t1, x1);          // t2 = x1^3
    fmul(t1, t1, A);           // t1 = A*x1^2
    fadd(t1, t1, t1);          // t1 = 2*A*x1^2
    fadd(t1, t1, t2);          // t1 = x1^3 + 2*A*x1^2
    fadd(t1, t1, t2);          // t1 = 2*x1^3 + 2*A*x1^2
    fadd(t1, t1, t2);          // t1 = 3*x1^3 + 2*A*x1^2
    fadd(t1, t1, x1);          // t1 = 3*x1^3 + 2*A*x1^2 + x1
    
    fadd(t2, y1, y1);          // t2 = 2*y1
    finverse(t3, t2);          // t3 = 1/(2*y1)
    fmul(lambda, t1, t3);      // lambda = (3*x1^2 + 2*A*x1 + 1) / (2*y1)
    
    // 计算 x3 = lambda^2 - A - 2*x1
    fmul(t1, lambda, lambda);  // t1 = lambda^2
    fsub(t1, t1, A);           // t1 = lambda^2 - A
    fsub(t1, t1, x1);          // t1 = lambda^2 - A - x1
    fsub(x3, t1, x1);          // x3 = lambda^2 - A - 2*x1
    
    // 计算 y3 = lambda * (x1 - x3) - y1
    fsub(t1, x1, x3);          // t1 = x1 - x3
    fmul(t2, lambda, t1);      // t2 = lambda * (x1 - x3)
    fsub(y3, t2, y1);          // y3 = lambda * (x1 - x3) - y1
}

int main() {
    printf("点加法和点倍增函数已定义\n");
    printf("需要完整的有限域算术实现才能运行\n");
    return 0;
}
```

## 11.8 特殊情况处理

### 无穷远点

如果 $P = O$ 或 $Q = O$，需要特殊处理：

```c
// 检查是否为无穷远点
int is_infinity(const field_elem x, const field_elem y) {
    // 简化检查，实际需要更复杂的逻辑
    return (x[0] == 0 && y[0] == 0);
}

// 处理无穷远点
void point_add_with_infinity(field_elem x3, field_elem y3,
                             const field_elem x1, const field_elem y1,
                             const field_elem x2, const field_elem y2,
                             const field_elem A)
{
    if (is_infinity(x1, y1)) {
        // P = O，返回 Q
        for (int i = 0; i < 16; i++) {
            x3[i] = x2[i];
            y3[i] = y2[i];
        }
        return;
    }
    
    if (is_infinity(x2, y2)) {
        // Q = O，返回 P
        for (int i = 0; i < 16; i++) {
            x3[i] = x1[i];
            y3[i] = y1[i];
        }
        return;
    }
    
    // 正常的点加法
    point_add_affine(x3, y3, x1, y1, x2, y2, A);
}
```

### $P = -Q$

如果 $P = -Q$，则 $P + Q = O$：

```c
// 检查 P 是否等于 -Q
int is_negative(const field_elem x1, const field_elem y1,
                const field_elem x2, const field_elem y2) {
    // P = -Q 当且仅当 x1 = x2 且 y1 = -y2
    // 简化检查
    return (x1[0] == x2[0] && y1[0] == -y2[0]);
}
```

## 11.9 练习

1. 推导 Montgomery 曲线的点倍增公式。
2. 实现射影坐标下的点加法。
3. 解释为什么 Montgomery 曲线的点加法不需要 y 坐标。

## 11.10 小结

点加法是椭圆曲线群运算的基本操作。通过使用射影坐标，我们可以避免昂贵的除法运算，提高效率。

在下一章中，我们将实现标量乘法，这是椭圆曲线密码学的核心操作。