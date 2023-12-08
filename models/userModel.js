const mongoose = require('mongoose');
const  validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto')


const userSchema = new mongoose.Schema({
    name:{
        type:String,
        required:[true,'please tell us your name'],
    },
    email:{
        type:String,
        required:[true,'please provide your email'],
        unique:true,
        lowercase:true,
        validate:[validator.isEmail, 'pleae provide  a valid email']
    },
    photo:{
        type:String
    },
    role:{
        type:String,
        enum:['user', 'guide', 'lead-guide', 'admin'],
        default:'user'
    },
    password:{
        type:String,
        required:[true, 'please provide password'],
        minLength:8,
        select:false
    },
    passwordConfirm: {
        type: String,
        required: [true, 'Please confirm your password'],
        validate: {
          // This only works on CREATE and SAVE!!!
          validator: function(element) {
            return element === this.password;
          },
          message: 'Passwords are not the same!'
        }
      },
    passwordChangeAt:Date,//this property always change when someone change password
    passwordResetToken:String,
    passwordResetExpires:Date,
    active:{
        type:Boolean,
        default:true,
        select:false
    }
})

userSchema.pre('save',async function(next){
    //only run when password is modified
    if(!this.isModified('password')){
        return next()
    }
    //hash password with cost of 12
    this.password =await bcrypt.hash(this.password,12)
    //delete password confirm field
    this.passwordConfirm = undefined
})

userSchema.pre('save',async function(next){
    if(!this.isModified('password')||this.isNew){
        return next()
    }
    this.passwordChangeAt = Date.now()-1000;
    next()
})

userSchema.pre(/^find/,async function(next){
    //this point to current query
    this.find({active:{$ne: false}}),
    next()
})

//instance method 'this' always point to current document

userSchema.method({
    correctPassword:async function(candidatePassword,userPassword){
        return await bcrypt.compare(candidatePassword,userPassword)
    },
    changePasswordAfter:function(JTWTimestamp){
        if(this.passwordChangeAt){
            const changedTimestamp  = parseInt(this.passwordChangeAt.getTime()/1000,10)
            return JTWTimestamp<changedTimestamp
        }
        return false;
    },
    createPasswordResetToken:function(){
        //generate buffer of random 32 byte then decoded to heximal string
        const resetToken = crypto.randomBytes(32).toString('hex')
        this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex')
        
        this.passwordResetExpires = Date.now()+10*1000*60
        return resetToken
    }

})

const User = mongoose.model('User',userSchema)

module.exports = User