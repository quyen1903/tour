const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync')
const User = require('./../models/userModel')
const AppError = require('./../utils/appError')
const sendEmail = require('./../utils/email')
const crypto = require('crypto')

const signToken = id=>{
    //return json web token
    return jwt.sign({ id }, process.env.JWT_SECRET,{
        expiresIn:process.env.JWT_EXPIRES_IN
    });  
}

const createSendToken = (user,statusCode,res)=>{
    const token = signToken(user._id)
    const cookieOptions = {
        expires:new Date(
            Date.now()+process.env.JWT_COOKIE_EXPIRES_IN*24*60*60*1000
        ),
        httpOnly:true//cookie can not be access or modified anyway by browser

    }
    if(process.env.NODE_ENV === 'production') cookieOptions.secure=true
    res.cookie('jwt',token,cookieOptions)
    //remove password from output
    user.password = undefined
    
    res.status(statusCode).json({
        status:'success',
        token,
        data:{
            user
        }
    })
}


exports.signup = catchAsync(async(req,res,next)=>{
    const newUser =await User.create(req.body)
    createSendToken(newUser,201,res);
});

exports.login = catchAsync(async(req,res,next)=>{
    const { email,password } = req.body
    //1check if email and password existed
    if(!email||!password){
        next(new AppError('Please provide email and password',400))
    }
    //2check if user existed && password is correct
    const user =await User.findOne({email}).select('+password')
    if(!user||!(await user.correctPassword(password,user.password))){
        next(new AppError('Please provide email and password',400))
    }
    //3 if everything ok, send token to client
    createSendToken(user,200,res)
})

exports.protect = catchAsync(async(req,res,next)=>{
    //1Getting token and check if it there
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        token = req.headers.authorization.split(' ')[1];
    }
    if(!token){
        return next(new AppError('You are not logged in! Please login to get access',401))
    }
    //2verify token
    const decoded = await promisify(jwt.verify)(token,process.env.JWT_SECRET)
    //3check if user still existed
    const freshUser = await User.findById(decoded.id)
    if(!freshUser){
        return next(new AppError('the user belong to this token no longer exist',401))
    }
    //4check if user change password after jwt issue
    //if freshUser.changePasswordAfter(decoded.iat) is true, return error
    if(freshUser.changePasswordAfter(decoded.iat)){//iat equal to issued at, that means the time token release
        return next(new AppError('user recently changed password, please login again',401))
    }
    req.user = freshUser
    next()
});

exports.restrictTo = (...roles)=>{
    return (req,res,next)=>{
        if(!roles.includes(req.user.role)){
            return next(new AppError('you dont have permission to perform this action',403))
        }
        next()
    }
}

exports.forgotPassword =catchAsync(async (req,res,next)=>{
    //1 get user base on POSTed email
    const user = await User.findOne({ email:req.body.email })
    if(!user){
        return next(new AppError('there is no user with email address',404))
    }
    //2 generate random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave:false })
    //3 send it to user email
    const resetURL =`${req.protocol}://${req.get('host')}/api/v1/user/resetPassword/${resetToken}`
    const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\n
    If you didn't forget your password, please ignore this email!`
    try {
        sendEmail({
            email:req.body.email,
            subject:'your password reset token(valid for 10 minutes)',
            message
        });
        res.status(200).json({
            status:'success',
            message:'token send to email!'
        })
    } catch (error) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({validateBeforeSave:false})
        return next(new AppError('there was an error sending the email. try again later',500))
    } 
})

exports.resetPassword =catchAsync(async (req,res,next)=>{
    //1 get user base on token
    const hashedToken =  crypto.createHash('sha256').update(req.params.token).digest('hex')
    const user = await User.findOne({
        passwordResetToken:hashedToken,
        passwordResetExpires:{$gt:Date.now()}
    })
    
    //2 if token not expired, and there is user, then set new password 
    if(!user){
        return next(new AppError('token is invalid or expired',400))
    }
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save()
    //3 update changedPassword property for user

    //4 log the user in, send jwt to client
    createSendToken(user,200,res)
});

exports.updatePassword = catchAsync(async (req,res,next)=>{
    //1get user from collection
    const user =await User.findById(req.user.id).select('+password')
    //2check if POSTed password is correct
    if(!(await user.correctPassword(req.body.passwordCurrent,user.password))){
        return next(new AppError('Your current password is wrong.', 401));
    }
    //3if so, update password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();

    //4log user in, send JWT
    createSendToken(user,200,res)

})