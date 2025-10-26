import * as UserModel from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import bcrypt from "bcryptjs";
import dotenv from 'dotenv';
dotenv.config();

export const getUsers = async (req, res) => {
  try {
    const users = await UserModel.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const signup = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role } = req.body;

    const existingUser = await UserModel.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const userId = await UserModel.createUser({ email, password, first_name, last_name, role });
    res.status(201).json({ message: 'User created', user_id: userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// In your login function
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.getUserByEmail(email);

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { 
        userId: user.user_id, 
        email: user.email, // Add email to token payload
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set httpOnly cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    });

    // Return user info for frontend
    res.json({
      success: true,
      message: "Login successful",
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        name: `${user.first_name} ${user.last_name}`, // NextAuth expects 'name'
      },
      token: token, // Also return token in response for NextAuth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



export const logout = (req, res) => {
  try {
    // Clear the auth_token cookie with multiple options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      expires: new Date(0),
      path: "/",
    };

    res.cookie("auth_token", "", cookieOptions);
    
    // Also clear for admin path to be safe
    res.cookie("auth_token", "", {
      ...cookieOptions,
      path: "/admin",
    });


    
    res.status(200).json({ 
      success: true,
      message: "Logged out successfully" 
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ 
      success: false,
      message: "Logout failed" 
    });
  }
};

// In your users controller
export const verify = async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    

    
    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        message: "No authentication token" 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user by ID from the token payload
    const user = await UserModel.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        valid: false, 
        message: "User not found" 
      });
    }


    
    res.json({ 
      valid: true, 
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      }
    });
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    res.status(401).json({ 
      valid: false, 
      message: "Invalid or expired token" 
    });
  }
};